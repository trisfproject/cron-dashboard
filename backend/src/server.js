import Fastify from 'fastify';
import cors from '@fastify/cors';
import { evaluateAlertsSafely } from './alerting.js';
import { bootstrapAdminUser, ensureAuthSchema } from './auth.js';
import { config } from './config.js';
import { pool, waitForDatabase } from './db.js';
import { ensureHeartbeatSchema, evaluateHeartbeatSchedules } from './heartbeat.js';
import { registerRoutes } from './routes.js';

const app = Fastify({
  logger: {
    level: config.logLevel
  }
});

app.decorate('config', config);

await app.register(cors, {
  origin: false
});

await registerRoutes(app);
await waitForDatabase(app.log);
await ensureAuthSchema();
await ensureHeartbeatSchema();
await bootstrapAdminUser(config, app.log);
evaluateAlertsSafely(app);
evaluateHeartbeatSchedules({ persist: true, app }).catch((error) => {
  app.log.warn({ err: error, error: error.message }, 'Heartbeat evaluation failed');
});

const alertEvaluationTimer = config.alertEvaluationIntervalMs > 0
  ? setInterval(() => {
      evaluateAlertsSafely(app);
      evaluateHeartbeatSchedules({ persist: true, app }).catch((error) => {
        app.log.warn({ err: error, error: error.message }, 'Heartbeat evaluation failed');
      });
    }, config.alertEvaluationIntervalMs)
  : null;

app.addHook('onClose', async () => {
  if (alertEvaluationTimer) {
    clearInterval(alertEvaluationTimer);
  }

  await pool.end();
});

const shutdown = async (signal) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: '0.0.0.0' });
