import * as fs from 'fs';
import type { SASLOptions } from 'kafkajs';

/**
 * Read a TLS CA bundle from a path and return the PEM contents, or
 * `undefined` if no path is configured. Used by every client that needs
 * to verify a server cert signed by the events-fsa CA.
 */
export function readCaBundle(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  return fs.readFileSync(path, 'utf8');
}

/**
 * Build a `pg.Pool` `ssl` config from the standard env vars:
 *   - DATABASE_SSL_MODE = disable | require | verify-ca | verify-full
 *   - DATABASE_SSL_CA_PATH = path to the CA cert (PEM)
 *
 * Returns `false` when SSL is explicitly disabled, `undefined` when
 * no SSL mode is set (let the connection string decide), and an object
 * otherwise.
 */
export function pgSslConfig(env: NodeJS.ProcessEnv = process.env):
  | false
  | { rejectUnauthorized: boolean; ca?: string }
  | undefined {
  const mode = (env.DATABASE_SSL_MODE || '').toLowerCase();
  if (!mode) return undefined;
  if (mode === 'disable' || mode === 'allow' || mode === 'prefer') {
    return false;
  }
  const ca = readCaBundle(env.DATABASE_SSL_CA_PATH);
  // `require` / `verify-ca` / `verify-full` all encrypt; only the last two
  // verify the chain. When a CA is provided we verify; otherwise we fall
  // back to the system trust store (and rejectUnauthorized stays true so
  // Node.js refuses unknown certs).
  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}

/**
 * Build a `node-redis` socket `tls` option. Returns `true` when TLS is
 * enabled with no custom trust (uses the system trust store), or an
 * object that pins the events-fsa CA, or `false` to skip TLS.
 */
export function redisTlsOption(env: NodeJS.ProcessEnv = process.env):
  | boolean
  | { ca: string; rejectUnauthorized: true } {
  if ((env.REDIS_TLS || '').toLowerCase() !== 'true') return false;
  const ca = readCaBundle(env.REDIS_TLS_CA_PATH);
  if (!ca) return true;
  return { ca, rejectUnauthorized: true };
}

/**
 * Build a `kafkajs` `ssl` config (or return `undefined` to keep the
 * default plain connection).
 */
export function kafkaSslConfig(env: NodeJS.ProcessEnv = process.env):
  | { ca: string[]; rejectUnauthorized: true }
  | undefined {
  const ca = readCaBundle(env.KAFKA_SSL_CA_PATH);
  if (!ca) return undefined;
  return { ca: [ca], rejectUnauthorized: true };
}

/**
 * Build a `kafkajs` `sasl` config. Returns `undefined` when any required
 * field is missing, so callers can simply spread it into the client
 * options when defined.
 */
export function kafkaSaslConfig(env: NodeJS.ProcessEnv = process.env): SASLOptions | undefined {
  const mechanism = env.KAFKA_SASL_MECHANISM;
  const username = env.KAFKA_SASL_USERNAME;
  const password = env.KAFKA_SASL_PASSWORD;
  if (!mechanism || !username || !password) return undefined;
  if (mechanism === 'plain') return { mechanism: 'plain', username, password };
  if (mechanism === 'scram-sha-256') return { mechanism: 'scram-sha-256', username, password };
  if (mechanism === 'scram-sha-512') return { mechanism: 'scram-sha-512', username, password };
  return undefined;
}
