import { describe, it, expect } from 'vitest';
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

  describe('uint8ArrayToHex', () => {
    it('should convert Uint8Array to hex string', () => {
      const input = new Uint8Array([104, 101, 108, 108, 111]);
      const result = Helper.uint8ArrayToHex(input);
      expect(result).toBe('68656c6c6f');
    });

    it('should convert empty Uint8Array', () => {
      const result = Helper.uint8ArrayToHex(new Uint8Array(0));
      expect(result).toBe('');
    });

    it('should handle single byte', () => {
      const result = Helper.uint8ArrayToHex(new Uint8Array([255]));
      expect(result).toBe('ff');
    });

    it('should pad single digit hex values', () => {
      const result = Helper.uint8ArrayToHex(new Uint8Array([0, 1, 15, 16]));
      expect(result).toBe('00010f10');
    });

    it('should handle all byte values', () => {
      const input = new Uint8Array([0, 127, 128, 255]);
      const result = Helper.uint8ArrayToHex(input);
      expect(result).toBe('007f80ff');
    });

    it('should handle large arrays', () => {
      const input = new Uint8Array(1000).fill(170); // 0xaa
      const result = Helper.uint8ArrayToHex(input);
      expect(result).toBe('aa'.repeat(1000));
      expect(result.length).toBe(2000);
    });
  });

  describe('hexToUint8Array', () => {
    it('should convert hex string to Uint8Array', () => {
      const result = Helper.hexToUint8Array('68656c6c6f');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
    });

    it('should convert empty hex string', () => {
      const result = Helper.hexToUint8Array('');
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it('should handle uppercase hex', () => {
      const result = Helper.hexToUint8Array('68656C6C6F');
      expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
    });

    it('should handle mixed case hex', () => {
      const result = Helper.hexToUint8Array('68656c6C6F');
      expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]);
    });

    it('should handle hex with leading zeros', () => {
      const result = Helper.hexToUint8Array('00010f10');
      expect(Array.from(result)).toEqual([0, 1, 15, 16]);
    });

    it('should handle all byte values', () => {
      const result = Helper.hexToUint8Array('007f80ff');
      expect(Array.from(result)).toEqual([0, 127, 128, 255]);
    });

    it('should throw error for odd length hex string', () => {
      expect(() => Helper.hexToUint8Array('abc')).toThrow('Invalid hex string');
      expect(() => Helper.hexToUint8Array('1')).toThrow('Invalid hex string');
    });

    it('should handle large hex strings', () => {
      const hexString = 'aa'.repeat(1000);
      const result = Helper.hexToUint8Array(hexString);
      expect(result.length).toBe(1000);
      expect(result.every(byte => byte === 170)).toBe(true);
    });
  });

  describe('hex round-trip conversion', () => {
    it('should preserve data through round-trip', () => {
      const original = new Uint8Array([104, 101, 108, 108, 111]);
      const hex = Helper.uint8ArrayToHex(original);
      const restored = Helper.hexToUint8Array(hex);
      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it('should preserve all byte values', () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }
      const hex = Helper.uint8ArrayToHex(original);
      const restored = Helper.hexToUint8Array(hex);
      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it('should preserve empty arrays', () => {
      const original = new Uint8Array(0);
      const hex = Helper.uint8ArrayToHex(original);
      const restored = Helper.hexToUint8Array(hex);
      expect(restored.length).toBe(0);
    });

    it('should preserve random data', () => {
      const original = new Uint8Array(100);
      crypto.getRandomValues(original);
      const hex = Helper.uint8ArrayToHex(original);
      const restored = Helper.hexToUint8Array(hex);
      expect(Array.from(restored)).toEqual(Array.from(original));
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
