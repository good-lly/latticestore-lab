import { Hono } from 'hono';

import { Redis } from '@upstash/redis/cloudflare';
import { Keyv } from 'keyv';
import { KeyvUpstash } from 'keyv-upstash';
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

function getRandomAuthToken() {
  return crypto.randomUUID();
}
function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const api = new Hono({ strict: false });

api.use('*', async (c, next) => {
  const { REDIS_URL, REDIS_TOKEN } = c.env;

  if (!REDIS_URL || !REDIS_TOKEN) {
    return c.json({ ok: false, message: 'Missing environment vars', status: 500 }, 500);
  }

  // const upstashRedis = new KeyvUpstash({
  //   store: new Redis({
  //     url: REDIS_URL,
  //     token: REDIS_TOKEN,
  //     enableTelemetry: false,
  //     automaticDeserialization: false,
  //   }),
  // });

  // const keyv = new KeyvUpstash({ store: upstashRedis });

  const rootfiles = new Keyv({
    store: new KeyvUpstash({
      url: REDIS_URL,
      token: REDIS_TOKEN,
      enableTelemetry: false,
      automaticDeserialization: false,
    }),

    namespace: 'rootfiles',
  });
  c.set('rootfiles', rootfiles);

  const users = new Keyv({
    store: new KeyvUpstash({
      url: REDIS_URL,
      token: REDIS_TOKEN,
      enableTelemetry: false,
      automaticDeserialization: true,
    }),

    namespace: 'users',
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  });
  c.set('users', users);

  const tokens = new Keyv({
    store: new KeyvUpstash({
      url: REDIS_URL,
      token: REDIS_TOKEN,
      enableTelemetry: false,
      automaticDeserialization: false,
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    }),

    namespace: 'tokens',
  });
  c.set('tokens', tokens);
  await next();
});
api.get('list', async c => {
  const keyvs = [c.get('users'), c.get('rootfiles'), c.get('tokens')];
  const data = [];
  for (const keyv of keyvs) {
    if (!keyv) {
      return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
    }
    for await (const [key, value] of keyv.iterator()) {
      data.push({ namespace: keyv.namespace, key, value });
    }
  }
  // You might want to implement this with Redis SCAN or maintain a list
  return c.json({ ok: true, data });
});

api.get('delete/:userId', async c => {
  const userId = c.req.param('userId');
  const keyvs = [c.get('users'), c.get('rootfiles')];
  if (!users || !rootfiles) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }

  const resp = await Promise.all(keyvs.map(keyv => keyv.delete(`user:${userId}`)));

  return c.json({ ok: true, message: 'Keys deleted successfully', data: resp });
});

api.get('clearall', async c => {
  const keyvs = [c.get('users'), c.get('rootfiles'), c.get('tokens')];
  if (!keyvs) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }

  await Promise.all(keyvs.map(keyv => keyv.clear()));

  return c.json({ ok: true, message: 'All keys cleared successfully' });
});

// TBD rework
api.post('login', async c => {
  const { userId, deviceName } = await c.req.json();
  const users = c.get('users');

  if (!users) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }

  const user = await users.get(`user:${userId}`);
  console.log('user is: ', user);
  if (!user) {
    return c.json({ ok: false, message: 'User not found' }, 404);
  }
  const userDevices = user.devices;
  const deviceExists = userDevices.includes(deviceName);
  if (!deviceExists) {
    userDevices.push(deviceName);
    await users.set(`user:${userId}`, { ...user, devices: userDevices });
  }

  const newAuthToken = getRandomAuthToken();
  const tokens = c.get('tokens');
  await tokens.delete(`user:${userId}`); // Invalidate previous token
  await tokens.set(`user:${userId}`, newAuthToken);

  return c.json({ ok: true, message: 'Login successful', token: newAuthToken });
});

// TBD rework
api.post('register', async c => {
  const { userId, deviceName, email } = await c.req.json();
  const users = c.get('users');

  if (!users) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }
  const userExists = await users.get(`user:${userId}`);
  console.log('userExists is: ', userExists);
  if (typeof userExists !== 'undefined') {
    return c.json({ ok: false, message: 'User already exists' }, 409);
  }
  // TBD enable this!
  // if (!emailIsValid(email)) {
  //   return c.json({ ok: false, message: 'Invalid email vole' }, 400);
  // }

  await users.set(`user:${userId}`, { userId, devices: [deviceName], email });

  return c.json({ ok: true, message: 'Registration successful' });
});

api.post('logout', async c => {
  const { userId } = await c.req.json();
  const tokens = c.get('tokens');

  if (!tokens) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }

  await tokens.delete(`user:${userId}`);

  return c.json({ ok: true, message: 'Logout successful' });
});

api.get('rooms/:roomId', async c => {
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

api.post('rooms/:roomId', async c => {
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

export default api;
export { api };
