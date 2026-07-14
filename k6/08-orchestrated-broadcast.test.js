// Orchestrated broadcast fanout test.
//
// Flow:
//   1. SEED   — register AUDIENCE device tokens across a small user pool.
//   2. RESET  — clear the collector's state so we measure only this run.
//   3. FIRE   — POST /notifications/broadcast (gateway returns 202).
//   4. WATCH  — poll the collector's /api/stats until the fanout settles, then
//               record per-worker-instance tallies and aggregate metrics.
//
// The collector (docker-compose.dev.yml `collector` service) consumes the
// notification.broadcast-batch-completed Kafka events that each of the 4
// notifications workers emits, so this test can see WHICH instance handled
// what. Live dashboard: http://localhost:4500
//
// Visualization: watch the live dashboard during the run; a static snapshot
// report is written to k6/out/orchestrated-report.html on completion.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Trend, Counter, Gauge } from 'k6/metrics';
import {
  BASE_URL,
  authHeaders,
  createUser,
  createAdminUser,
  registerToken,
  randomString,
  randomFutureDate,
} from './helpers.js';

const AUDIENCE = Number(__ENV.AUDIENCE || 2000);
const SEED_VUS = Number(__ENV.SEED_VUS || 300);
const USER_POOL = Number(__ENV.USER_POOL || 50);
const COLLECTOR_URL = __ENV.COLLECTOR_URL || 'http://localhost:4500';
const WATCH_TIMEOUT_S = Number(__ENV.WATCH_TIMEOUT_S || 120);

const PLATFORMS = ['ios', 'android', 'web'];

const seedRegDuration = new Trend('seed_token_reg_duration', true);
const fanoutSettleMs = new Trend('fanout_settle_ms', true);
const batchesTotal = new Counter('fanout_batches_total');
const sentTotal = new Counter('fanout_sent_total');
const failedTotal = new Counter('fanout_failed_total');
const instancesActive = new Gauge('fanout_instances_active');
const batchesByInstance = new Counter('fanout_batches_by_instance');

export const options = {
  scenarios: {
    seed: {
      executor: 'shared-iterations',
      vus: SEED_VUS,
      iterations: AUDIENCE,
      maxDuration: '3m',
      exec: 'seedScenario',
    },
    orchestrate: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: `${WATCH_TIMEOUT_S + 30}s`,
      startTime: '3m',
      exec: 'orchestrateScenario',
    },
  },
  thresholds: {
    seed_token_reg_duration: ['p(95)<2000'],
    // The whole fanout across 4 workers should settle well under the timeout.
    fanout_settle_ms: [`p(95)<${WATCH_TIMEOUT_S * 1000}`],
    http_req_failed: ['rate<0.05'],
  },
};

function deviceToken(i) {
  return `orchestrated-token-${i}`;
}

export function setup() {
  const users = [];
  for (let i = 0; i < USER_POOL; i++) users.push(createUser(`orch-${i}`));
  const admin = createAdminUser();

  const eventRes = http.post(
    `${BASE_URL}/events`,
    JSON.stringify({
      title: `Orchestrated broadcast ${randomString(6)}`,
      description: 'Seeded by k6 08-orchestrated-broadcast.',
      date: randomFutureDate(),
    }),
    { headers: authHeaders(admin.token) },
  );
  if (eventRes.status !== 201) {
    fail(`setup: event create failed — ${eventRes.status}: ${eventRes.body}`);
  }
  const eventBody = eventRes.json();
  const eventId = eventBody?.data?.eventId ?? eventBody?.eventId;

  return { users, admin, eventId };
}

export function seedScenario(data) {
  const i = exec.scenario.iterationInTest;
  const user = data.users[i % data.users.length];
  const platform = PLATFORMS[i % PLATFORMS.length];

  const res = registerToken(user.token, user.userId, deviceToken(i), platform);
  seedRegDuration.add(res.timings.duration);
  check(res, { 'seed register token: 201': (r) => r.status === 201 });
  sleep(0.02);
}

export function orchestrateScenario(data) {
  // RESET collector state so we only measure this run's completions.
  const reset = http.post(`${COLLECTOR_URL}/api/reset`, null, {
    timeout: '10s',
  });
  check(reset, { 'collector reset ok': (r) => r.status === 200 }) ||
    console.warn(`collector reset failed (${reset.status}) — is it running?`);

  // FIRE the broadcast.
  const fired = http.post(
    `${BASE_URL}/notifications/broadcast`,
    JSON.stringify({
      title: `Orchestrated broadcast ${randomString(6)}`,
      body: 'Fanned out to every registered device.',
      data: { source: 'k6-orchestrated' },
      eventId: data.eventId,
    }),
    { headers: authHeaders(data.admin.token), timeout: '15s' },
  );
  check(fired, { 'broadcast accepted (202)': (r) => r.status === 202 });
  const firedAt = Date.now();

  // WATCH — poll until the collector reports the latest broadcast settled.
  let snapshot = null;
  const deadline = firedAt + WATCH_TIMEOUT_S * 1000;
  while (Date.now() < deadline) {
    const res = http.get(`${COLLECTOR_URL}/api/stats`, { timeout: '10s' });
    if (res.status === 200) {
      const body = res.json();
      const latest = body?.latest;
      if (latest && latest.settled && latest.totals.batches > 0) {
        snapshot = latest;
        break;
      }
    }
    sleep(1);
  }

  if (!snapshot) {
    console.error(
      `No settled broadcast within ${WATCH_TIMEOUT_S}s — collector reachable? workers up?`,
    );
    return;
  }

  // Record aggregate + per-instance metrics.
  fanoutSettleMs.add(snapshot.durationMs);
  batchesTotal.add(snapshot.totals.batches);
  sentTotal.add(snapshot.totals.sent);
  failedTotal.add(snapshot.totals.failed);
  instancesActive.add(snapshot.instanceCount);
  for (const inst of snapshot.instances) {
    batchesByInstance.add(inst.batches, { instance: inst.instance });
  }

  // Human-readable per-instance tally to the console.
  const rows = snapshot.instances
    .map(
      (i) =>
        `  ${i.instance.padEnd(16)}  ${String(i.batches).padStart(6)} batches  ` +
        `${String(i.sent).padStart(8)} sent  ${String(i.failed).padStart(6)} failed`,
    )
    .join('\n');
  console.log(
    `\n── Broadcast ${snapshot.broadcastId} ──\n` +
      `${snapshot.instanceCount} instances · ${snapshot.totals.batches} batches · ` +
      `${snapshot.totals.sent} sent · ${snapshot.totals.failed} failed · ` +
      `${(snapshot.durationMs / 1000).toFixed(1)}s\n${rows}\n`,
  );

  // Stash for the summary report.
  globalThis.__snapshot = snapshot;
}

export function handleSummary(data) {
  const snap = globalThis.__snapshot || null;
  return {
    stdout: textSummary(data),
    'k6/out/orchestrated-stats.json': JSON.stringify(snap, null, 2),
    'k6/out/orchestrated-report.html': reportHtml(snap),
  };
}

// Minimal dependency-free stdout summary (avoids remote jslib imports).
function textSummary(data) {
  const lines = ['', '  fanout summary', '  ─────────────'];
  for (const name of [
    'fanout_instances_active',
    'fanout_batches_total',
    'fanout_sent_total',
    'fanout_failed_total',
    'fanout_settle_ms',
  ]) {
    const m = data.metrics[name];
    if (!m) continue;
    const v = m.values;
    const shown =
      v.value !== undefined
        ? v.value
        : v.count !== undefined
          ? v.count
          : `avg=${(v.avg ?? 0).toFixed(0)} p95=${(v['p(95)'] ?? 0).toFixed(0)}`;
    lines.push(`  ${name.padEnd(26)} ${shown}`);
  }
  return lines.join('\n') + '\n';
}

// Self-contained static report — bakes the final snapshot in so it survives
// after the stack is torn down (unlike the live dashboard).
function reportHtml(snap) {
  const data = JSON.stringify(snap);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orchestrated Broadcast Report</title>
<style>
 :root{color-scheme:light dark;--bg:#0b0f17;--panel:#141b2b;--ink:#e7edf7;--muted:#8ea0bd;--grid:#243149;--accent:#4f9cff;--ok:#37d399;--bad:#ff6b6b}
 @media(prefers-color-scheme:light){:root{--bg:#f5f7fb;--panel:#fff;--ink:#141b2b;--muted:#5b6b86;--grid:#e4e9f2;--accent:#2563eb;--ok:#0d9f6e;--bad:#e5484d}}
 body{margin:0;font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--ink);padding:24px}
 h1{font-size:20px;margin:0 0 16px}.tiles{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
 .tile{background:var(--panel);border:1px solid var(--grid);border-radius:12px;padding:14px 18px;min-width:120px}
 .tile .k{color:var(--muted);font-size:12px;text-transform:uppercase}.tile .v{font-size:24px;font-weight:650}
 .panel{background:var(--panel);border:1px solid var(--grid);border-radius:12px;padding:18px}
 .row{display:flex;align-items:center;gap:12px;margin:9px 0}.row .name{width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .bar{flex:1;height:22px;background:var(--grid);border-radius:6px;overflow:hidden}.bar>span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--ok))}
 .num{width:150px;text-align:right;color:var(--muted)}.empty{color:var(--muted);padding:30px;text-align:center}
</style></head><body>
<h1>Orchestrated Broadcast Report</h1>
<div id="app"><div class="empty">No snapshot captured.</div></div>
<script>
const b=${data};const fmt=n=>(n??0).toLocaleString();
if(b){const max=Math.max(1,...b.instances.map(i=>i.batches));
document.getElementById('app').innerHTML=
'<div class="tiles">'+[['Instances',fmt(b.instanceCount)],['Batches',fmt(b.totals.batches)],
['Sent',fmt(b.totals.sent)],['Failed',fmt(b.totals.failed)],['Duration',(b.durationMs/1000).toFixed(1)+'s']]
.map(([k,v])=>'<div class="tile"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>').join('')+'</div>'+
'<div class="panel"><h2>Batches per instance</h2>'+b.instances.map(i=>{const p=(i.batches/max*100).toFixed(1);
return '<div class="row"><div class="name" title="'+i.instance+'">'+i.instance+'</div><div class="bar"><span style="width:'+p+'%"></span></div><div class="num">'+fmt(i.batches)+' batches · '+fmt(i.sent)+' sent</div></div>'}).join('')+'</div>';}
</script></body></html>`;
}
