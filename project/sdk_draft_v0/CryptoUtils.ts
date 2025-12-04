import { cshake256 } from '@noble/hashes/sha3-addons.js';
import { toUint8Array, uint8ArrayToHex } from './Helpers.js';
import {
  KEM_KEY_LENGTH_BYTES,
  DSA_KEY_LENGTH_BYTES,
  CUSTOM_KEM_STRING,
  CUSTOM_DSA_STRING,
  DEFAULT_AEAD_KEY_LENGTH_BYTES,
  IS_MANAGER_KEY,
  CUSTOM_SUBKEY_ROLE_STRING,
  MEMBER_ID_STRING,
} from './Consts.js';
import type { MemberRole } from './Consts.js';
export class CryptoUtilsError extends Error {
  constructor(message: string, public readonly code: string) {
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
   * Derive two seeds from a single master seed using cSHAKE256 (PQ-safe)
   * cSHAKE256 should provide 256-bit security (NIST Level 5)
   */
  static deriveSeeds(masterSeed: Uint8Array): { kemSeed: Uint8Array; dsaSeed: Uint8Array } {
    return {
      kemSeed: this.letscShake256(masterSeed, toUint8Array(CUSTOM_KEM_STRING), KEM_KEY_LENGTH_BYTES),
      dsaSeed: this.letscShake256(masterSeed, toUint8Array(CUSTOM_DSA_STRING), DSA_KEY_LENGTH_BYTES),
    };
  }

  /**
   * Computes cSHAKE256 hash of input data
   * @param data - Data to hash (Uint8Array)
   * @param customData - Customization data (Uint8Array)
   * @param outputLength - Desired output length in bytes
   * @returns Hash as Uint8Array
   * @throws {CryptoUtilsError} If hashing fails or outputLength is invalid
   */
  public static letscShake256(data: Uint8Array, customData: Uint8Array, outputLength: number): Uint8Array {
    try {
      if (outputLength <= 0) {
        throw new CryptoUtilsError('Output length must be a positive integer', 'INVALID_OUTPUT_LENGTH');
      }
      return cshake256(data, { personalization: customData, dkLen: outputLength });
    } catch (error) {
      throw new CryptoUtilsError(
        `SHAKE-256 hashing failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'SHAKE256_HASHING_FAILED',
      );
    }
  }

  public static deriveKeyForRole(role: MemberRole, rootKey: Uint8Array): Uint8Array {
    if (IS_MANAGER_KEY(role)) {
      return rootKey;
    }
    return this.letscShake256(rootKey, toUint8Array(CUSTOM_SUBKEY_ROLE_STRING), DEFAULT_AEAD_KEY_LENGTH_BYTES);
  }

  public static computeMemberId(dsaPublicKey: Uint8Array): string {
    return uint8ArrayToHex(this.letscShake256(dsaPublicKey, toUint8Array(MEMBER_ID_STRING), 32)).toLowerCase();
  }
}
