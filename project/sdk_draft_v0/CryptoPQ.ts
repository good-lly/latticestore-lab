import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa.js';
import { CryptoUtils } from './CryptoUtils.js';

export type CryptoPQKeyPair = {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
};

export type CryptoPQEncapsulated = {
  cipherText: Uint8Array;
  sharedSecret: Uint8Array;
};

export class CryptoPQError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CryptoPQError';
  }
}

export const ML_DSA_SIGNATURE_SIZE = 2420; // Correct size for ML-DSA-44 signatures
export const ML_DSA_SECRET_KEY_SIZE = 2560; // Correct size for ML-DSA-44 secret keys
export const ML_DSA_PUBLIC_KEY_SIZE = 1312; // Correct size for ML-DSA-44 public keys

/**
 * Post-quantum cryptography using ML-KEM 1024
 * Source: https://github.com/paulmillr/noble-post-quantum?tab=readme-ov-file#ml-kem--kyber-shared-secrets
 * Reference FIPS-203:  https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.203.pdf
 */
export class CryptoPQ {
  /**
   * Generates a public/private key pair for ML-KEM 1024.
   * @param {Uint8Array} [seed=CryptoUtils.generateRandomBytes(64)] - Optional seed for key generation. If not provided, a random seed will be generated.
   * @returns {CryptoPQKeyPair} An object containing the secretKey and publicKey as Uint8Arrays.
   */
  static generateKemKeys = (seed: Uint8Array = CryptoUtils.generateRandomBytes(64)): CryptoPQKeyPair => {
    if (seed.length !== 64) {
      throw new CryptoPQError('Seed must be 64 bytes long', 'INVALID_SEED_LENGTH');
    }
    try {
      const { secretKey, publicKey } = ml_kem1024.keygen(seed);
      return { secretKey, publicKey };
    } catch (error) {
      throw new CryptoPQError(
        `ML-KEM key generation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'KEY_GENERATION_FAILED',
      );
    }
  };

  /**
   * Encapsulates a shared secret using the provided public key.
   * @param {Uint8Array} publicKey - The public key to use for encapsulation.
   * @returns {CryptoPQEncapsulated} An object containing the cipherText and sharedSecret as Uint8Arrays.
   */
  static encapsulate(publicKey: Uint8Array): CryptoPQEncapsulated {
    try {
      const { cipherText, sharedSecret } = ml_kem1024.encapsulate(publicKey);
      return { cipherText, sharedSecret };
    } catch (error) {
      throw new CryptoPQError(
        `Encapsulation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'ENCAPSULATION_FAILED',
      );
    }
  }

  /**
   * Decapsulates a shared secret using the provided ciphertext and secret key.
   * @param {Uint8Array} ciphertext - The ciphertext to decapsulate.
   * @param {Uint8Array} secretKey - The secret key to use for decapsulation.
   * @returns {Uint8Array} The shared secret as a Uint8Array.
   */
  static decapsulate(ciphertext: Uint8Array, secretKey: Uint8Array): Uint8Array {
    try {
      const plaintext = ml_kem1024.decapsulate(ciphertext, secretKey);
      return plaintext;
    } catch (error) {
      throw new CryptoPQError(
        `Decapsulation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'DECAPSULATION_FAILED',
      );
    }
  }

  /**
   * Generates a public/private key pair for ML-DSA 44.
   * @param {Uint8Array} [seed=CryptoUtils.generateRandomBytes(32)] - Optional seed for key generation. If not provided, a random seed will be generated.
   * @returns {CryptoPQKeyPair} An object containing the secretKey and publicKey as Uint8Arrays.
   */
  static generateDsaKeys = (seed: Uint8Array = CryptoUtils.generateRandomBytes(32)): CryptoPQKeyPair => {
    try {
      const { secretKey, publicKey } = ml_dsa44.keygen(seed);
      return { secretKey, publicKey };
    } catch (error) {
      throw new CryptoPQError(
        `ML-DSA key generation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'KEY_GENERATION_FAILED',
      );
    }
  };

  /**
   * Signs a message using the provided secret key.
   * @param {Uint8Array} message - The message to sign.
   * @param {Uint8Array} secretKey - The secret key to use for signing.
   * @returns {Uint8Array} The signature as a Uint8Array.
   */
  static sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
    try {
      const signature = ml_dsa44.sign(message, secretKey);
      return signature;
    } catch (error) {
      throw new CryptoPQError(
        `Signing failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'SIGNING_FAILED',
      );
    }
  }

  /**
   * Verifies a signature using the provided public key and message.
   * @param {Uint8Array} publicKey - The public key to use for verification.
   * @param {Uint8Array} message - The message that was signed.
   * @param {Uint8Array} signature - The signature to verify.
   * @returns {boolean} True if the signature is valid, false otherwise.
   */
  static verifySignature(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
    if (signature.length !== ML_DSA_SIGNATURE_SIZE) {
      throw new CryptoPQError('Invalid signature length', 'INVALID_SIGNATURE_LENGTH');
    }
    if (publicKey.length !== ML_DSA_PUBLIC_KEY_SIZE) {
      throw new CryptoPQError('Invalid public key length', 'INVALID_PUBLIC_KEY_LENGTH');
    }
    try {
      return ml_dsa44.verify(signature, message, publicKey);
    } catch (error) {
      throw new CryptoPQError(
        `Signature verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'SIGNATURE_VERIFICATION_FAILED',
      );
    }
  }
}
