import { describe, it, expect } from 'vitest'; // or 'jest'
import { Helper } from './Helpers';

describe('Helper', () => {
  describe('toUint8Array', () => {
    it('should convert ASCII string to Uint8Array', () => {
      const result = Helper.toUint8Array('hello');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
    });

    it('should convert empty string', () => {
      const result = Helper.toUint8Array('');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it('should handle UTF-8 characters', () => {
      const result = Helper.toUint8Array('héllo');
      expect(result).toBeInstanceOf(Uint8Array);
      // é is encoded as 2 bytes in UTF-8
      expect(result.length).toBe(6);
    });

    it('should handle emojis', () => {
      const result = Helper.toUint8Array('👋🌍');
      expect(result).toBeInstanceOf(Uint8Array);
      // Each emoji is 4 bytes in UTF-8
      expect(result.length).toBe(8);
    });
  });

  describe('fromUint8Array', () => {
    it('should convert Uint8Array to string', () => {
      const input = new Uint8Array([104, 101, 108, 108, 111]);
      const result = Helper.fromUint8Array(input);
      expect(result).toBe('hello');
    });

    it('should convert empty Uint8Array', () => {
      const result = Helper.fromUint8Array(new Uint8Array(0));
      expect(result).toBe('');
    });

    it('should handle UTF-8 encoded data', () => {
      const input = new Uint8Array([104, 195, 169, 108, 108, 111]);
      const result = Helper.fromUint8Array(input);
      expect(result).toBe('héllo');
    });

    it('should handle emoji bytes', () => {
      const input = new Uint8Array([240, 159, 145, 139, 240, 159, 140, 141]);
      const result = Helper.fromUint8Array(input);
      expect(result).toBe('👋🌍');
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve ASCII text', () => {
      const original = 'Hello, World!';
      const encoded = Helper.toUint8Array(original);
      const decoded = Helper.fromUint8Array(encoded);
      expect(decoded).toBe(original);
    });

    it('should preserve Unicode text', () => {
      const original = 'Héllo Wörld! 你好世界 🌍';
      const encoded = Helper.toUint8Array(original);
      const decoded = Helper.fromUint8Array(encoded);
      expect(decoded).toBe(original);
    });

    it('should preserve special characters', () => {
      const original = '\n\t\r\0 特殊字符';
      const encoded = Helper.toUint8Array(original);
      const decoded = Helper.fromUint8Array(encoded);
      expect(decoded).toBe(original);
    });

    it('should handle long strings', () => {
      const original = 'a'.repeat(10000);
      const encoded = Helper.toUint8Array(original);
      const decoded = Helper.fromUint8Array(encoded);
      expect(decoded).toBe(original);
      expect(encoded.length).toBe(10000);
    });
  });
});
