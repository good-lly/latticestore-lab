import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { Redis } from '@upstash/redis/cloudflare';
import { KeyvUpstash } from 'keyv-upstash';

const app = new Hono({ strict: false });

// Helper function to calculate SHA256 hash
async function calculateSHA256(data) {
  const encoder = new TextEncoder();
  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  const dataBuffer = encoder.encode(dataString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

app.use(
  '*',
  cors({
    origin: '*', // TODO: Allow all origins in development
    credentials: false,
  }),
);

app.use('*', logger());

app.use('*', async (c, next) => {
  const { REDIS_URL, REDIS_TOKEN } = c.env;

  if (!REDIS_URL || !REDIS_TOKEN) {
    return c.json({ ok: false, message: 'Missing environment vars', status: 500 }, 500);
  }

  const upstashRedis = new Redis({
    url: REDIS_URL,
    token: REDIS_TOKEN,
    enableTelemetry: false,
    automaticDeserialization: false,
  });

  const keyv = new KeyvUpstash({ upstashRedis });
  c.set('keyv', keyv);

  await next();
});

app.notFound(c => {
  return c.json({ ok: false, message: '404 Message' }, 404);
});

app.onError((err, c) => {
  console.error(`${err}`);
  return c.json({ ok: false, message: 'Error msg: ' + `${err}` }, 500);
});

console.log(`🟢🏃 Provider API Listening on http://localhost:8787`);

app.get('/', c => c.text('Hono!'));

app.get('/list', async c => {
  const keyv = c.get('keyv');
  const data = [];
  if (!keyv) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }
  for await (const [key, value] of keyv.iterator()) {
    // Skip metadata keys in the listing
    if (!key.endsWith(':metadata')) {
      data.push({ name: key, value: value });
    }
  }
  // You might want to implement this with Redis SCAN or maintain a list
  return c.json({ ok: true, data });
});

app.get('/rooms/:roomId', async c => {
  const roomId = c.req.param('roomId');
  const keyv = c.get('keyv');

  if (!keyv) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }

  // Get the client's hash from header
  const clientHash = c.req.header('x-data-hash') || c.req.header('if-none-match');

  // Retrieve room data and hash from storage
  const [roomData, storedHash] = await Promise.all([keyv.get(`room:${roomId}:data`), keyv.get(`room:${roomId}:hash`)]);

  if (!roomData) {
    return c.json({ ok: false, message: 'Room not found' }, 404);
  }

  // Calculate current hash if not stored (migration case)
  const currentHash = storedHash || (await calculateSHA256(roomData));

  // If client has the same hash, return null data (no update needed)
  if (clientHash === currentHash) {
    return c.json({
      ok: true,
      data: null,
      hash: currentHash,
    });
  }

  // Client needs update, send full data with hash
  return c.json({
    ok: true,
    data: roomData,
    hash: currentHash,
  });
});

app.post('/rooms/:roomId', async c => {
  const roomId = c.req.param('roomId');
  const keyv = c.get('keyv');

  if (!keyv) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }

  const body = await c.req.json();

  // Get the previous hash from header or body
  const previousHash = c.req.header('x-previous-hash') || c.req.header('if-match') || body.previousHash;

  // Get the new state from body
  const newState = body.state || body.data;

  if (!newState) {
    return c.json({ ok: false, message: 'Missing state/data in request body' }, 400);
  }

  // Get current stored data and hash
  const [currentData, currentHash] = await Promise.all([
    keyv.get(`room:${roomId}:data`),
    keyv.get(`room:${roomId}:hash`),
  ]);

  // If room exists, verify the previous hash matches
  if (currentData) {
    const actualCurrentHash = currentHash || (await calculateSHA256(currentData));

    if (previousHash && previousHash !== actualCurrentHash) {
      return c.json(
        {
          ok: false,
          message: 'Conflict: data has been modified',
          currentHash: actualCurrentHash,
        },
        409,
      );
    }
  } else if (previousHash) {
    // Room doesn't exist but client provided a hash (expecting existing data)
    return c.json(
      {
        ok: false,
        message: 'Room not found but previousHash provided',
      },
      404,
    );
  }

  // Calculate new hash
  const newHash = await calculateSHA256(newState);

  // Store both data and hash atomically
  await Promise.all([keyv.set(`room:${roomId}:data`, newState), keyv.set(`room:${roomId}:hash`, newHash)]);

  return c.json({
    ok: true,
    hash: newHash,
  });
});

// Optional: Add a DELETE endpoint for cleanup
// app.delete('/rooms/:roomId', async c => {
//   const roomId = c.req.param('roomId');
//   const keyv = c.get('keyv');

//   if (!keyv) {
//     return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
//   }

//   // Delete both data and hash
//   await Promise.all([
//     keyv.delete(`room:${roomId}:data`),
//     keyv.delete(`room:${roomId}:hash`)
//   ]);

//   return c.json({ ok: true });
// });

export default app;
