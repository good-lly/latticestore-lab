const CONCURRENT_UPLOADS_PER_WORKER = 6;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
let cryptoKey;
self.onmessage = async e => {
  const { file, authToken, cKey, endpoint, chunkSize, startChunk, endChunk, totalChunks } = e.data;
  cryptoKey = await importCryptoKey(cKey);
  try {
    const results = await processFileChunksParallel(
      file,
      authToken,
      endpoint,
      chunkSize,
      startChunk,
      endChunk,
      totalChunks,
    );

    self.postMessage({
      type: 'complete',
      data: { success: true, error: null, results },
    });
  } catch (error) {
    self.postMessage({
      type: 'complete',
      data: { success: false, error: error.message },
    });
  }
};

function* chunkGenerator(file, chunkSize, startChunk, endChunk) {
  for (let chunkIndex = startChunk; chunkIndex < endChunk; chunkIndex++) {
    const offset = chunkIndex * chunkSize;
    const end = Math.min(offset + chunkSize, file.size);
    yield {
      chunkIndex,
      offset,
      end,
      blob: file.slice(offset, end),
    };
  }
}

async function processFileChunksParallel(file, authToken, endpoint, chunkSize, startChunk, endChunk, totalChunks) {
  const results = [];
  const chunks = chunkGenerator(file, chunkSize, startChunk, endChunk);
  const uploadPromises = [];
  const activeUploads = new Set();

  for (const chunkData of chunks) {
    while (activeUploads.size >= CONCURRENT_UPLOADS_PER_WORKER) {
      await Promise.race(activeUploads);
    }

    const uploadPromise = processAndUploadChunk(chunkData, endpoint, authToken, file.name, totalChunks)
      .then(result => {
        results.push(result);
        activeUploads.delete(uploadPromise);
        return result;
      })
      .catch(error => {
        activeUploads.delete(uploadPromise);
        throw error;
      });

    activeUploads.add(uploadPromise);
    uploadPromises.push(uploadPromise);
  }

  await Promise.all(uploadPromises);
  results.sort((a, b) => a.chunkIndex - b.chunkIndex);
  return results;
}

async function processAndUploadChunk(chunkData, endpoint, authToken, fileName, totalChunks) {
  const { chunkIndex, blob } = chunkData;

  try {
    self.postMessage({
      type: 'progress',
      data: { chunkIndex, status: 'processing' },
    });

    const encryptedData = await encryptChunk(new Uint8Array(await blob.arrayBuffer()), cryptoKey);

    const uploadResult = await uploadChunkBinary(
      encryptedData,
      endpoint,
      authToken,
      fileName,
      chunkIndex,
      totalChunks,
      chunkIndex === totalChunks - 1,
    );

    if (!uploadResult.success) {
      throw new Error(`Failed to upload chunk ${chunkIndex}`);
    }

    const result = {
      chunkIndex,
      etag: uploadResult.etag || `chunk-${chunkIndex}-${Date.now()}`,
    };

    self.postMessage({
      type: 'progress',
      data: { chunkIndex, status: 'completed' },
    });

    self.postMessage({
      type: 'chunk-complete',
      data: result,
    });

    return result;
  } catch (error) {
    self.postMessage({
      type: 'progress',
      data: { chunkIndex, status: 'failed' },
    });
    throw new Error(`Chunk ${chunkIndex} failed: ${error.message}`);
  }
}

async function importCryptoKey(keyBuffer) {
  // const encoder = new TextEncoder();
  // const keyData = encoder.encode(key);
  // const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
  return await crypto.subtle.importKey('raw', keyBuffer, { name: 'AES-GCM' }, false, ['encrypt']);
}

async function encryptChunk(data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);
  const result = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  result.set(iv);
  result.set(new Uint8Array(encryptedBuffer), iv.length);
  return result;
}

async function uploadChunkBinary(encryptedData, endpoint, authToken, fileName, chunkIndex, totalChunks, isLast) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          // 'Content-Type': 'application/octet-stream',
          // Don't set Content-Type - browser will set it with boundary
        },
        body: encryptedData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const etag = response.headers.get('etag') || result.etag || result.ETag || `${fileName}-chunk-${chunkIndex}`;

      return { success: true, etag };
    } catch (error) {
      console.error(`Upload attempt ${attempt + 1} failed for chunk ${chunkIndex}:`, error);

      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt]));
      } else {
        throw error;
      }
    }
  }
}
