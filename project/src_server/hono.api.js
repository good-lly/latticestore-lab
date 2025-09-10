import { Hono } from 'hono';

import { Redis } from '@upstash/redis/cloudflare';
import { Keyv } from 'keyv';
import { KeyvUpstash } from 'keyv-upstash';

const IO_GB = 10 * 1024 * 1024 * 1024; // 10 GB in bytes

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
  const chunks = new Keyv({
    store: new KeyvUpstash({
      url: REDIS_URL,
      token: REDIS_TOKEN,
      enableTelemetry: false,
      automaticDeserialization: false,
    }),

    namespace: 'chunks',
  });
  c.set('chunks', chunks);

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
    }),
    ttl: 60 * 60 * 1000, // 1 hour
    namespace: 'tokens',
  });
  c.set('tokens', tokens);
  await next();
});
api.get('list', async c => {
  const keyvs = [c.get('users'), c.get('chunks'), c.get('rootfiles'), c.get('tokens')];
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
  const keyvs = [c.get('users'), c.get('chunks'), c.get('rootfiles'), c.get('tokens')];
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
  const rootfiles = c.get('rootfiles');
  const userRootfileData = await rootfiles.get(`user:${userId}`);
  const user = await users.get(`user:${userId}`);
  console.log('user is: ', user);
  if (!user || !userRootfileData) {
    return c.json({ ok: false, message: 'User not found' }, 404);
  }
  const userDevices = user.devices;
  const deviceExists = userDevices.includes(deviceName);
  if (!deviceExists) {
    userDevices.push(deviceName);
    await users.set(`user:${userId}`, { ...user, devices: userDevices });
  }

  const bytesUsed = user.bytesUsed;
  const bytesLimit = user.bytesLimit;
  const percentageUsed = (bytesUsed / bytesLimit) * 100;
  const limited = user.limited;
  const remainingBytes = Math.max(0, bytesLimit - bytesUsed);

  const newAuthToken = getRandomAuthToken();
  const tokens = c.get('tokens');
  await tokens.delete(`user:${userId}`); // Invalidate previous token
  await tokens.set(`user:${userId}`, newAuthToken);

  return c.json({
    ok: true,
    message: 'Login successful',
    token: newAuthToken,
    user: { userId, deviceName, bytesUsed, bytesLimit, percentageUsed, limited, remainingBytes },
    data: userRootfileData,
  });
});

// TBD rework
api.post('register', async c => {
  const { userId, deviceName, email, initJSONData } = await c.req.json();
  const users = c.get('users');
  const rootfiles = c.get('rootfiles');
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
  if (email !== 'peter' && email !== 'locus') {
    return c.json({ ok: false, message: 'Invalid email' }, 400);
  }

  const bytesUsed = 0;
  const bytesLimit = IO_GB;
  const percentageUsed = (bytesUsed / bytesLimit) * 100;

  await users.set(`user:${userId}`, {
    userId,
    devices: [deviceName],
    email,
    bytesUsed,
    bytesLimit,
    percentageUsed,
    limited: false,
    remainingBytes: Math.max(0, bytesLimit - bytesUsed),
  });
  console.log('Initial JSON data is: ', initJSONData);
  await rootfiles.set(`user:${userId}`, initJSONData);

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

// api.get('rooms/:roomId', async c => {
//   const roomId = c.req.param('roomId');
//   const keyv = c.get('keyv');

//   if (!keyv) {
//     return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
//   }

//   // Get the client's hash from header
//   const clientHash = c.req.header('x-data-hash') || c.req.header('if-none-match');

//   // Retrieve room data and hash from storage
//   const [roomData, storedHash] = await Promise.all([keyv.get(`room:${roomId}:data`), keyv.get(`room:${roomId}:hash`)]);

//   if (!roomData) {
//     return c.json({ ok: false, message: 'Room not found' }, 404);
//   }

//   // Calculate current hash if not stored (migration case)
//   const currentHash = storedHash || (await calculateSHA256(roomData));

//   // If client has the same hash, return null data (no update needed)
//   if (clientHash === currentHash) {
//     return c.json({
//       ok: true,
//       data: null,
//       hash: currentHash,
//     });
//   }

//   // Client needs update, send full data with hash
//   return c.json({
//     ok: true,
//     data: roomData,
//     hash: currentHash,
//   });
// });

// api.post('rooms/:roomId', async c => {
//   const roomId = c.req.param('roomId');
//   const keyv = c.get('keyv');

//   if (!keyv) {
//     return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
//   }

//   const body = await c.req.json();

//   // Get the previous hash from header or body
//   const previousHash = c.req.header('x-previous-hash') || c.req.header('if-match') || body.previousHash;

//   // Get the new state from body
//   const newState = body.state || body.data;

//   if (!newState) {
//     return c.json({ ok: false, message: 'Missing state/data in request body' }, 400);
//   }

//   // Get current stored data and hash
//   const [currentData, currentHash] = await Promise.all([
//     keyv.get(`room:${roomId}:data`),
//     keyv.get(`room:${roomId}:hash`),
//   ]);

//   // If room exists, verify the previous hash matches
//   if (currentData) {
//     const actualCurrentHash = currentHash || (await calculateSHA256(currentData));

//     if (previousHash && previousHash !== actualCurrentHash) {
//       return c.json(
//         {
//           ok: false,
//           message: 'Conflict: data has been modified',
//           currentHash: actualCurrentHash,
//         },
//         409,
//       );
//     }
//   } else if (previousHash) {
//     // Room doesn't exist but client provided a hash (expecting existing data)
//     return c.json(
//       {
//         ok: false,
//         message: 'Room not found but previousHash provided',
//       },
//       404,
//     );
//   }

//   // Calculate new hash
//   const newHash = await calculateSHA256(newState);

//   // Store both data and hash atomically
//   await Promise.all([keyv.set(`room:${roomId}:data`, newState), keyv.set(`room:${roomId}:hash`, newHash)]);

//   return c.json({
//     ok: true,
//     hash: newHash,
//   });
// });

api.post('upload', async c => {
  const authTokenBearer = c.req.header('Authorization');
  const providedAuthToken = authTokenBearer.split(' ')[1];
  const userId = c.req.header('x-user-id');
  if (!userId || !providedAuthToken) {
    return c.json({ ok: false, message: 'Missing user userId or auth token' }, 400);
  }
  const tokens = c.get('tokens');
  const users = c.get('users');
  const chunks = c.get('chunks');

  if (!tokens || !users || !chunks) {
    return c.json({ ok: false, message: 'Keyv not initialized' }, 500);
  }
  // Verify auth token
  const existingUserToken = await tokens.get(`user:${userId}`);
  if (!existingUserToken || existingUserToken !== providedAuthToken) {
    return c.json({ ok: false, message: 'Invalid user ID or auth token' }, 401);
  }

  // Get user data
  const user = await users.get(`user:${userId}`);
  if (!user) {
    return c.json({ ok: false, message: 'User not found' }, 404);
  }

  // Check if user is limited
  if (user.limited) {
    return c.json(
      {
        ok: false,
        message: 'User storage limit exceeded. Cannot upload.',
        currentSize: user.size,
        sizeLimit: user.sizeLimit,
        limited: true,
      },
      403,
    );
  }
  const body = await c.req.arrayBuffer();
  const size = body.byteLength;
  const contentDisposition = c.req.header('Content-Disposition');
  const fileName = contentDisposition ? contentDisposition.split('filename=')[1].replace(/"/g, '') : 'unknown';
  if (fileName === 'unknown') {
    return c.json({ ok: false, message: 'Missing filename in Content-Disposition header' }, 400);
  }
  console.log('Uploading chunk for user:', userId, 'fileName:', fileName, 'size:', size);

  // save data via s3mini the most optimal way as fast as possible ...
  return c.json({ ok: true, message: 'Chunk upload endpoint' }, 200);
});

export default api;
export { api };
