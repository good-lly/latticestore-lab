export class CryptoUtilsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CryptoUtilsError';
  }
}

export class CryptoUtils {
  /**
   * Generates a random UUID (version 4)
   * @returns A string representation of the UUID
   */
  static generateRandomUUID = () => {
    return crypto.randomUUID();
  };

  /**
   * Generates cryptographically secure random bytes
   * @param length - Number of random bytes to generate (default: 32)
   * @returns Uint8Array of random bytes
   * @throws {CryptoUtilsError} If length is not a positive integer
   */
  static generateRandomBytes = (length: number = 32): Uint8Array => {
    if (length <= 0) {
      throw new CryptoUtilsError('Length must be a positive integer', 'INVALID_LENGTH');
    }
    return crypto.getRandomValues(new Uint8Array(length));
  };

  /**
   * Computes SHA-256 hash of input data
   * @param data - Data to hash (string or Uint8Array)
   * @param encoding - Output encoding format
   * @returns Hash in specified encoding
   * @throws {AEADError} If hashing fails or encoding is unsupported
   */
  static async sha256(
    data: Uint8Array<ArrayBuffer> | string,
    encoding: 'hex' | 'base64' | 'arraybuffer' | 'uint8array' = 'arraybuffer',
  ): Promise<string | ArrayBuffer | Uint8Array> {
    try {
      const msgUint8 = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);

      switch (encoding) {
        case 'arraybuffer':
          return hashBuffer;
        case 'uint8array':
          return new Uint8Array(hashBuffer);
        case 'hex': {
          const hashArray = new Uint8Array(hashBuffer);
          return Array.from(hashArray, b => b.toString(16).padStart(2, '0')).join('');
        }
        case 'base64': {
          const hashArray = new Uint8Array(hashBuffer);
          return btoa(String.fromCharCode(...hashArray));
        }
        default:
          throw new CryptoUtilsError(`Unsupported encoding: ${encoding}`, 'UNSUPPORTED_ENCODING');
      }
    } catch (error) {
      throw new CryptoUtilsError(
        `Hashing failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'HASHING_FAILED',
      );
    }
  }
}
