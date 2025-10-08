export class Helper {
  private constructor() {} // Prevent instantiation

  public static encoder = new TextEncoder();
  public static decoder = new TextDecoder();
  private static isNode = typeof process !== 'undefined' && process.versions?.node !== undefined;

  /** Converts a string to a Uint8Array using UTF-8 encoding. */
  static toUint8Array(data: string): Uint8Array {
    return this.encoder.encode(data);
  }

  /** Converts a Uint8Array back to a string using UTF-8 decoding. */
  static fromUint8Array(data: Uint8Array): string {
    return this.decoder.decode(data);
  }

  /** Converts a Uint8Array to a hexadecimal string. */
  static uint8ArrayToHex(uint8array: Uint8Array): string {
    let hex = '';
    for (let i = 0; i < uint8array.length; i++) {
      hex += uint8array[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /** Converts a hexadecimal string to a Uint8Array. */
  static hexToUint8Array(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new Error('Invalid hex string');
    }
    const uint8array = new Uint8Array(hex.length / 2);
    for (let i = 0, j = 0; i < hex.length; i += 2, j++) {
      uint8array[j] = parseInt(hex.slice(i, i + 2), 16);
    }
    return uint8array;
  }

  static uint8ArrayToBase64(uint8array: Uint8Array): string {
    // Node.js: use Buffer (faster and works in all versions)
    if (this.isNode) {
      return Buffer.from(uint8array).toString('base64');
    }

    // Browser: btoa with chunking for large arrays
    if (uint8array.length < 65536) {
      // Fast path for small arrays
      return btoa(String.fromCharCode(...uint8array));
    }

    // Chunked approach for large arrays (avoid stack overflow)
    let binary = '';
    const chunkSize = 32768;
    for (let i = 0; i < uint8array.length; i += chunkSize) {
      const chunk = uint8array.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  static base64ToUint8Array(base64: string): Uint8Array {
    // Node.js: use Buffer
    if (this.isNode) {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }

    // Browser: atob
    const binary = atob(base64);
    const uint8array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      uint8array[i] = binary.charCodeAt(i);
    }
    return uint8array;
  }
}
