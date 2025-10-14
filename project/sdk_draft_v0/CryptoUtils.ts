import { shake256 } from '@noble/hashes/sha3.js';
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

  /**
   * Derive two seeds from a single master seed using SHAKE256 (PQ-safe)
   * SHAKE256 should provide 256-bit security (NIST Level 5)
   */
  static deriveSeeds(
    masterSeed: Uint8Array,
    context: string = 'lattice-store-v1',
  ): { kemSeed: Uint8Array; dsaSeed: Uint8Array; accountId: Uint8Array } {
    // Add context for domain separation
    const contextBytes = new TextEncoder().encode(context);
    const input = new Uint8Array(contextBytes.length + masterSeed.length);
    input.set(contextBytes);
    input.set(masterSeed, contextBytes.length);

    // SHAKE256 can output arbitrary length
    const outputLength = 128; // 64 bytes for KEM + 32 bytes for DSA + 32 bytes for AccountID
    const derived = this.letsShake256(input, outputLength);

    return {
      kemSeed: derived.slice(0, 64), // First 64 bytes
      dsaSeed: derived.slice(64, 96), // Next 32 bytes
      accountId: derived.slice(96, 128), // Last 32 bytes
    };
  }

  /**
   * Computes SHAKE-256 hash of input data
   * @param data - Data to hash (Uint8Array)
   * @param outputLength - Desired output length in bytes
   * @returns Hash as Uint8Array
   * @throws {CryptoUtilsError} If hashing fails or outputLength is invalid
   */
  public static letsShake256(data: Uint8Array, outputLength: number): Uint8Array {
    try {
      if (outputLength <= 0) {
        throw new CryptoUtilsError('Output length must be a positive integer', 'INVALID_OUTPUT_LENGTH');
      }
      return shake256(data, { dkLen: outputLength });
    } catch (error) {
      throw new CryptoUtilsError(
        `SHAKE-256 hashing failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'SHAKE256_HASHING_FAILED',
      );
    }
  }
}
