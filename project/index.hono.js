import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { html, raw } from 'hono/html';
import { serveStatic } from 'hono/cloudflare-workers';

import { api } from './src_server/hono.api.js';

const app = new Hono({ strict: false });

app.use(
  '*',
  cors({
    origin: '*', // TODO: Allow all origins in development
    credentials: false,
  }),
);
app.use('*', logger());
app.use('/public/*', serveStatic({ root: './docs/public/' }));

app.route('api/', api);

app.notFound(c => {
  return c.json({ ok: false, message: '404 Message' }, 404);
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ ok: false, message: 'Error msg: ' + `${err}` }, 500);
});

app.get('/*', serveStatic({ path: './docs/index.html' }));

console.log(`🟢🏃 Provider API Listening on http://localhost:8787`);

export default app;
