import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { pool, waitForDatabase } from './db.js';
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

app.addHook('onClose', async () => {
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
