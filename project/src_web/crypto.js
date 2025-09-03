export async function sha256(message, encoding = 'arraybuffer') {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
  if (encoding === 'arraybuffer') return hashBuffer;
  const hashArray = new Uint8Array(hashBuffer);
  switch (encoding) {
    case 'uint8array':
      return hashArray;
    case 'hex':
      return Array.from(hashArray, b => b.toString(16).padStart(2, '0')).join('');
    case 'base64':
      return btoa(String.fromCharCode(...hashArray));
    default:
      throw new Error(`Unsupported encoding: ${encoding}`);
  }
}
