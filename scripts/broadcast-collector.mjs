// Broadcast completion collector — consumes notification.broadcast-batch-completed
// from Kafka, aggregates per-broadcast / per-worker-instance tallies, and serves
// a live dashboard + JSON API that the k6 orchestrated test polls.
//
// Runs as a compose service on the backend network so it resolves kafka:29092
// directly (the broker advertises an internal hostname; an external client can't
// reach it). See the `collector` service in docker-compose.dev.yml.
//
// Env: KAFKA_BROKER (default kafka:29092), PORT (default 4500),
//      SETTLE_MS (default 4000) — a broadcast is "settled" once no completion
//      event has arrived for this long.
import http from 'node:http';
import { Kafka, logLevel } from 'kafkajs';

const BROKER = process.env.KAFKA_BROKER ?? 'kafka:29092';
const PORT = Number(process.env.PORT ?? 4500);
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 4000);
const TOPIC = 'notification.broadcast-batch-completed';

// broadcastId -> { firstAt, lastAt, instances: Map<id, {batches,sent,failed,firstAt,lastAt}> }
const broadcasts = new Map();
let order = []; // broadcastIds in arrival order (newest last)

function now() {
  return Date.now();
}

function recordCompletion(evt) {
  const { broadcastId, processedBy, sent = 0, failed = 0 } = evt;
  if (!broadcastId) return;
  const t = now();

  let b = broadcasts.get(broadcastId);
  if (!b) {
    b = { firstAt: t, lastAt: t, instances: new Map() };
    broadcasts.set(broadcastId, b);
    order.push(broadcastId);
    // Keep memory bounded — retain the 20 most recent broadcasts.
    if (order.length > 20) {
      const drop = order.shift();
      broadcasts.delete(drop);
    }
  }
  b.lastAt = t;

  const id = processedBy ?? 'unknown';
  let inst = b.instances.get(id);
  if (!inst) {
    inst = { batches: 0, sent: 0, failed: 0, firstAt: t, lastAt: t };
    b.instances.set(id, inst);
  }
  inst.batches += 1;
  inst.sent += sent;
  inst.failed += failed;
  inst.lastAt = t;
}

function summarize(broadcastId) {
  const b = broadcasts.get(broadcastId);
  if (!b) return null;
  const instances = [...b.instances.entries()]
    .map(([id, v]) => ({ instance: id, ...v }))
    .sort((a, z) => z.batches - a.batches);
  const totals = instances.reduce(
    (acc, i) => ({
      batches: acc.batches + i.batches,
      sent: acc.sent + i.sent,
      failed: acc.failed + i.failed,
    }),
    { batches: 0, sent: 0, failed: 0 },
  );
  const idleFor = now() - b.lastAt;
  return {
    broadcastId,
    firstAt: b.firstAt,
    lastAt: b.lastAt,
    durationMs: b.lastAt - b.firstAt,
    idleMs: idleFor,
    settled: idleFor >= SETTLE_MS,
    instanceCount: instances.length,
    totals,
    instances,
  };
}

function statsPayload() {
  const latestId = order[order.length - 1] ?? null;
  return {
    settleMs: SETTLE_MS,
    broadcastCount: order.length,
    latest: latestId ? summarize(latestId) : null,
    broadcasts: order.map(summarize),
  };
}

// ---- Kafka consumer -------------------------------------------------------

const kafka = new Kafka({
  clientId: 'broadcast-collector',
  brokers: BROKER.split(',').map((s) => s.trim()),
  logLevel: logLevel.NOTHING,
});
const consumer = kafka.consumer({ groupId: 'broadcast-collector' });

async function startConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        let evt = JSON.parse(message.value.toString());
        // NestJS emits the event payload directly, but be defensive about any
        // envelope wrapping (request/reply serializers add a `.value`).
        if (evt && evt.value && evt.value.broadcastId) evt = evt.value;
        recordCompletion(evt);
      } catch (err) {
        console.error('bad completion message:', err.message);
      }
    },
  });
  console.log(`collector: consuming ${TOPIC} from ${BROKER}`);
}

// ---- HTTP server ----------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/reset') {
    broadcasts.clear();
    order = [];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (req.url === '/api/stats') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
    });
    res.end(JSON.stringify(statsPayload()));
    return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(DASHBOARD_HTML);
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

// Self-contained live dashboard — no external assets (CSP-safe, offline-safe).
const DASHBOARD_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Broadcast Fanout — Worker Distribution</title>
<style>
  :root { color-scheme: light dark;
    --bg:#0b0f17; --panel:#141b2b; --ink:#e7edf7; --muted:#8ea0bd;
    --grid:#243149; --accent:#4f9cff; --ok:#37d399; --bad:#ff6b6b; }
  @media (prefers-color-scheme: light) { :root {
    --bg:#f5f7fb; --panel:#fff; --ink:#141b2b; --muted:#5b6b86;
    --grid:#e4e9f2; --accent:#2563eb; --ok:#0d9f6e; --bad:#e5484d; } }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    background:var(--bg); color:var(--ink); padding:24px; }
  h1 { font-size:20px; margin:0 0 4px; }
  .sub { color:var(--muted); margin-bottom:20px; }
  .tiles { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px; }
  .tile { background:var(--panel); border:1px solid var(--grid); border-radius:12px;
    padding:14px 18px; min-width:130px; }
  .tile .k { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  .tile .v { font-size:26px; font-weight:650; font-variant-numeric:tabular-nums; }
  .pill { display:inline-block; padding:2px 10px; border-radius:999px; font-size:12px; font-weight:600; }
  .pill.live { background:color-mix(in srgb,var(--accent) 20%,transparent); color:var(--accent); }
  .pill.done { background:color-mix(in srgb,var(--ok) 22%,transparent); color:var(--ok); }
  .panel { background:var(--panel); border:1px solid var(--grid); border-radius:12px;
    padding:18px; margin-bottom:18px; }
  .panel h2 { font-size:14px; margin:0 0 14px; color:var(--muted); text-transform:uppercase; letter-spacing:.04em; }
  .row { display:flex; align-items:center; gap:12px; margin:9px 0; }
  .row .name { width:170px; font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bar { flex:1; height:22px; background:var(--grid); border-radius:6px; overflow:hidden; position:relative; }
  .bar > span { display:block; height:100%; background:linear-gradient(90deg,var(--accent),color-mix(in srgb,var(--accent) 60%,var(--ok))); transition:width .4s ease; }
  .row .num { width:150px; text-align:right; font-variant-numeric:tabular-nums; color:var(--muted); }
  .empty { color:var(--muted); padding:30px 0; text-align:center; }
  footer { color:var(--muted); font-size:12px; margin-top:8px; }
</style></head>
<body>
  <h1>Broadcast Fanout — Worker Distribution</h1>
  <div class="sub">Live tally of <code>notification.broadcast-batch-completed</code>, grouped by worker instance.</div>
  <div class="tiles" id="tiles"></div>
  <div class="panel"><h2>Batches processed per instance</h2><div id="bars"></div></div>
  <footer id="foot"></footer>
<script>
const fmt = (n) => (n ?? 0).toLocaleString();
async function tick() {
  let s; try { s = await (await fetch('/api/stats')).json(); } catch { return; }
  const b = s.latest;
  const tiles = document.getElementById('tiles');
  const bars = document.getElementById('bars');
  if (!b) {
    tiles.innerHTML = '';
    bars.innerHTML = '<div class="empty">Waiting for a broadcast…</div>';
    document.getElementById('foot').textContent = 'Broadcasts seen: ' + s.broadcastCount;
    return;
  }
  const pill = b.settled ? '<span class="pill done">SETTLED</span>' : '<span class="pill live">LIVE</span>';
  tiles.innerHTML = [
    ['Status', pill],
    ['Instances', fmt(b.instanceCount)],
    ['Batches', fmt(b.totals.batches)],
    ['Sent', '<span style="color:var(--ok)">' + fmt(b.totals.sent) + '</span>'],
    ['Failed', '<span style="color:var(--bad)">' + fmt(b.totals.failed) + '</span>'],
    ['Duration', (b.durationMs/1000).toFixed(1) + 's'],
  ].map(([k,v]) => '<div class="tile"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>').join('');

  const max = Math.max(1, ...b.instances.map(i => i.batches));
  bars.innerHTML = b.instances.map(i => {
    const pct = (i.batches / max * 100).toFixed(1);
    return '<div class="row"><div class="name" title="'+i.instance+'">'+i.instance+'</div>'
      + '<div class="bar"><span style="width:'+pct+'%"></span></div>'
      + '<div class="num">'+fmt(i.batches)+' batches · '+fmt(i.sent)+' sent</div></div>';
  }).join('');
  document.getElementById('foot').textContent =
    'broadcast ' + b.broadcastId + ' · idle ' + (b.idleMs/1000).toFixed(1) + 's / settle ' + (s.settleMs/1000) + 's';
}
tick(); setInterval(tick, 1000);
</script>
</body></html>`;

server.listen(PORT, () => console.log(`collector: dashboard on :${PORT}`));

startConsumer().catch((err) => {
  console.error('collector: kafka consumer failed:', err);
  process.exit(1);
});

async function shutdown() {
  try {
    await consumer.disconnect();
  } catch {
    // best effort
  }
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
