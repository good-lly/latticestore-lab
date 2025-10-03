import { describe, it, expect } from 'vitest';
import { CryptoPQ } from './CryptoPQ';

describe('CryptoPQ', () => {
  describe('generateKeys', () => {
    it('should generate valid key pair', () => {
      const { secretKey, publicKey } = CryptoPQ.generateKeys();

      expect(secretKey).toBeInstanceOf(Uint8Array);
      expect(publicKey).toBeInstanceOf(Uint8Array);
      expect(secretKey.length).toBe(3168); // ML-KEM-1024 secret key size
      expect(publicKey.length).toBe(1568); // ML-KEM-1024 public key size
    });

    it('should generate different keys without seed', () => {
      const keys1 = CryptoPQ.generateKeys();
      const keys2 = CryptoPQ.generateKeys();

      expect(keys1.publicKey).not.toEqual(keys2.publicKey);
      expect(keys1.secretKey).not.toEqual(keys2.secretKey);
    });

    it('should generate same keys with same seed', () => {
      const seed = new Uint8Array(64).fill(1);
      const keys1 = CryptoPQ.generateKeys(seed);
      const keys2 = CryptoPQ.generateKeys(seed);

      expect(keys1.publicKey).toEqual(keys2.publicKey);
      expect(keys1.secretKey).toEqual(keys2.secretKey);
    });

    it('should generate different keys with different seeds', () => {
      const seed1 = new Uint8Array(64).fill(1);
      const seed2 = new Uint8Array(64).fill(2);
      const keys1 = CryptoPQ.generateKeys(seed1);
      const keys2 = CryptoPQ.generateKeys(seed2);

      expect(keys1.publicKey).not.toEqual(keys2.publicKey);
    });
  });

  describe('encapsulate', () => {
    it('should encapsulate shared secret', () => {
      const { publicKey } = CryptoPQ.generateKeys();
      const { cipherText, sharedSecret } = CryptoPQ.encapsulate(publicKey);

      expect(cipherText).toBeInstanceOf(Uint8Array);
      expect(sharedSecret).toBeInstanceOf(Uint8Array);
      expect(cipherText.length).toBe(1568); // ML-KEM-1024 ciphertext size
      expect(sharedSecret.length).toBe(32); // 256-bit shared secret
    });

    it('should produce different ciphertexts for same public key', () => {
      const { publicKey } = CryptoPQ.generateKeys();
      const result1 = CryptoPQ.encapsulate(publicKey);
      const result2 = CryptoPQ.encapsulate(publicKey);

      expect(result1.cipherText).not.toEqual(result2.cipherText);
      expect(result1.sharedSecret).not.toEqual(result2.sharedSecret);
    });
  });

  describe('decapsulate', () => {
    it('should decapsulate shared secret', () => {
      const { secretKey, publicKey } = CryptoPQ.generateKeys();
      const { cipherText, sharedSecret } = CryptoPQ.encapsulate(publicKey);

      const decapsulated = CryptoPQ.decapsulate(cipherText, secretKey);

      expect(decapsulated).toEqual(sharedSecret);
    });

    it('should fail with wrong secret key', () => {
      const keys1 = CryptoPQ.generateKeys();
      const keys2 = CryptoPQ.generateKeys();
      const { cipherText, sharedSecret } = CryptoPQ.encapsulate(keys1.publicKey);

      const wrongDecapsulated = CryptoPQ.decapsulate(cipherText, keys2.secretKey);

      expect(wrongDecapsulated).not.toEqual(sharedSecret);
    });
  });

  describe('round-trip', () => {
    it('should complete full key exchange', () => {
      // Alice generates keys
      const alice = CryptoPQ.generateKeys();

      // Bob encapsulates using Alice's public key
      const { cipherText, sharedSecret: bobSecret } = CryptoPQ.encapsulate(alice.publicKey);

      // Alice decapsulates using her secret key
      const aliceSecret = CryptoPQ.decapsulate(cipherText, alice.secretKey);

      // Both should have same shared secret
      expect(aliceSecret).toEqual(bobSecret);
    });

    it('should work with deterministic keys', () => {
      const seed = new Uint8Array(64).fill(42);
      const keys = CryptoPQ.generateKeys(seed);

      const { cipherText, sharedSecret: original } = CryptoPQ.encapsulate(keys.publicKey);
      const decapsulated = CryptoPQ.decapsulate(cipherText, keys.secretKey);

      expect(decapsulated).toEqual(original);
    });
  });
});
