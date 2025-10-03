import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { CryptoUtils } from './CryptoUtils.js';

export type CryptoPQKeyPair = {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
};

export type CryptoPQEncapsulated = {
  cipherText: Uint8Array;
  sharedSecret: Uint8Array;
};

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
  static generateKeys = (seed: Uint8Array = CryptoUtils.generateRandomBytes(64)): CryptoPQKeyPair => {
    const { secretKey, publicKey } = ml_kem1024.keygen(seed);
    return { secretKey, publicKey };
  };

  /**
   * Encapsulates a shared secret using the provided public key.
   * @param {Uint8Array} publicKey - The public key to use for encapsulation.
   * @returns {CryptoPQEncapsulated} An object containing the cipherText and sharedSecret as Uint8Arrays.
   */
  static encapsulate(publicKey: Uint8Array): CryptoPQEncapsulated {
    const { cipherText, sharedSecret } = ml_kem1024.encapsulate(publicKey);
    return { cipherText, sharedSecret };
  }

  /**
   * Decapsulates a shared secret using the provided ciphertext and secret key.
   * @param {Uint8Array} ciphertext - The ciphertext to decapsulate.
   * @param {Uint8Array} secretKey - The secret key to use for decapsulation.
   * @returns {Uint8Array} The shared secret as a Uint8Array.
   */
  static decapsulate(ciphertext: Uint8Array, secretKey: Uint8Array): Uint8Array {
    const plaintext = ml_kem1024.decapsulate(ciphertext, secretKey);
    return plaintext;
  }
}
