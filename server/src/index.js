import cors from '@fastify/cors';
import Fastify from 'fastify';

import { config } from './config.js';
import { mailerReady } from './mailer.js';
import { startReconciler } from './orders.js';
import { errorHandler, registerRoutes } from './routes.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || 'info' },
  // За nginx настоящий IP приходит в X-Forwarded-For — иначе все лимиты
  // считались бы на один-единственный адрес прокси.
  trustProxy: true,
  bodyLimit: 32 * 1024,
});

await app.register(cors, {
  origin: [config.publicUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST'],
});

app.setErrorHandler(errorHandler);
await registerRoutes(app);

const stopReconciler = startReconciler();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    app.log.info('останавливаемся…');
    stopReconciler();
    await app.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });

app.log.info(
  `KICB: режим ${config.kicb.mode}, ${config.kicb.baseUrl}, ` +
    `terminalId ${config.kicb.terminalPublicKey ? 'шифруется RSA' : 'открытым текстом (ожидается VPN)'}`
);
if (!mailerReady) app.log.warn('SMTP не настроен — билеты будут печататься в консоль');
