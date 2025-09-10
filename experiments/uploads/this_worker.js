// Simplified File Worker - handles upload/download with optional encryption
const CHUNK_SIZE_DEFAULT = 8 * 1024 * 1024; // 5MB default
const MAX_RETRIES = 3;
const RETRY_DELAYS = [500, 1000, 2000];

// Message handler
self.onmessage = async e => {
  const { action, ...params } = e.data;

  try {
    let result;

    switch (action) {
      case 'upload':
        result = await handleUpload(params);
        break;
      case 'download':
        result = await handleDownload(params);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    self.postMessage({
      type: 'complete',
      success: true,
      data: result,
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      success: false,
      error: error.message,
    });
  }
};

// ============= UPLOAD FUNCTIONS =============

async function handleUpload({ fileId, file, endpoint, authToken, userId, encryptionKey, chunkSize }) {
  const chunks =
    chunkSize || CHUNK_SIZE_DEFAULT
      ? await uploadInChunks(fileId, file, endpoint, authToken, userId, encryptionKey, chunkSize)
      : await uploadSingleFile(fileId, file, endpoint, authToken, userId, encryptionKey);

  // If single file, return the etag directly; if chunks, return all chunk etags
  const etag = chunks.length === 1 ? chunks[0].etag : chunks.map(c => c.etag);

  return {
    chunks,
    fileId,
    etag,
  };
}

async function uploadSingleFile(fileId, file, endpoint, authToken, userId, encryptionKey) {
  const data = new Uint8Array(await file.arrayBuffer());

  // Encrypt if key provided
  const processedData = encryptionKey ? await encryptData(data, encryptionKey) : data;

  // Upload with retry logic
  const result = await uploadWithRetry(processedData, endpoint, authToken, userId, {
    fileName: fileId,
  });

  return [result];
}

async function uploadInChunks(fileId, file, endpoint, authToken, userId, encryptionKey, chunkSize) {
  const size = chunkSize || CHUNK_SIZE_DEFAULT;
  const totalChunks = Math.ceil(file.size / size);
  const results = [];

  // Generate or import encryption key if needed
  const cryptoKey = encryptionKey ? await importKey(encryptionKey) : null;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * size;
    const end = Math.min(start + size, file.size);
    const chunk = file.slice(start, end);
    const data = new Uint8Array(await chunk.arrayBuffer());

    // Encrypt chunk if key provided
    const processedData = cryptoKey ? await encryptChunk(data, cryptoKey) : data;

    self.postMessage({
      type: 'progress',
      chunkIndex: i,
      totalChunks,
      status: 'uploading',
    });

    const result = await uploadWithRetry(processedData, endpoint, authToken, userId, {
      fileName: fileId,
    });

    results.push(result);

    self.postMessage({
      type: 'progress',
      chunkIndex: i,
      totalChunks,
      status: 'completed',
    });
  }

  return results;
}

async function uploadWithRetry(data, endpoint, authToken, userId, metadata) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // const formData = new FormData();
      // formData.append('file', new Blob([data]));
      // formData.append('metadata', JSON.stringify(metadata));

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-User-Id': userId,
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${metadata.fileName}"`,
        },
        body: data,
      });

      if (!response.ok) {
        if (response.status === 401) {
          // skip retries on unauthorized
          attempt = MAX_RETRIES;
          throw new Error(`Upload failed: ${response.status} - Unauthorized`);
        }
        throw new Error(`Upload failed: ${response.status}`);
      }

      const result = await response.json();
      return {
        chunkIndex: metadata.chunkIndex,
        etag: result.etag || `chunk-${metadata.chunkIndex}`,
        size: data.byteLength,
      };
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      } else {
        throw error;
      }
    }
  }
}

// ============= DOWNLOAD FUNCTIONS =============

async function handleDownload({ fileId, endpoint, authToken, userId, decryptionKey }) {
  const data = await downloadWithRetry(fileId, endpoint, authToken, userId);

  // Decrypt if key provided
  const processedData = decryptionKey ? await decryptData(data, decryptionKey) : data;

  // Create blob for the file
  const blob = new Blob([processedData]);

  return {
    blob,
    size: processedData.byteLength,
    decrypted: !!decryptionKey,
  };
}

async function downloadWithRetry(fileId, endpoint, authToken, userId) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${endpoint}/${fileId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'X-User-Id': userId,
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (error) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      } else {
        throw error;
      }
    }
  }
}

// ============= ENCRYPTION FUNCTIONS =============

async function generateKey() {
  return await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function importKey(keyData) {
  // If keyData is a string, convert to buffer
  if (typeof keyData === 'string') {
    const encoder = new TextEncoder();
    const keyBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(keyData));
    return await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  // If already a buffer/array
  return await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptData(data, key) {
  const cryptoKey = await importKey(key);
  return await encryptChunk(data, cryptoKey);
}

async function encryptChunk(data, cryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);

  // Combine IV and encrypted data
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encrypted), iv.length);

  return result;
}

async function decryptData(data, key) {
  const cryptoKey = await importKey(key);

  // Extract IV and encrypted content
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);

  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);

  return new Uint8Array(decrypted);
}

// ============= USAGE EXAMPLES =============
/*
// Upload example:
worker.postMessage({
  action: 'upload',
  file: fileObject,
  endpoint: 'https://api.example.com/upload',
  authToken: 'token123',
  userId: 'user456',
  encryptionKey: 'mySecretKey', // optional - generates if not provided
  chunkSize: 5 * 1024 * 1024    // optional - if provided, will chunk the file
});

// Download example:
worker.postMessage({
  action: 'download',
  fileId: 'file789',
  endpoint: 'https://api.example.com/files',
  authToken: 'token123',
  userId: 'user456',
  decryptionKey: 'mySecretKey' // optional - won't decrypt if not provided
});

// Listen for responses:
worker.onmessage = (e) => {
  if (e.data.type === 'complete') {
    console.log('Operation completed:', e.data);
  } else if (e.data.type === 'progress') {
    console.log(`Chunk ${e.data.chunkIndex + 1}/${e.data.totalChunks}: ${e.data.status}`);
  } else if (e.data.type === 'error') {
    console.error('Operation failed:', e.data.error);
  }
};
*/
