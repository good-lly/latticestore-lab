import { ApiClient } from './ApiClient';
import { CryptoPQ } from './CryptoPQ';
import { CryptoUtils } from './CryptoUtils';

import { vi, describe, it, expect, afterEach, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('./CryptoPQ');
vi.mock('./CryptoUtils');

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchJSON', () => {
    const mockUrl = 'https://api.example.com/test';
    const mockRequestId = 'test-request-id';

    it('should successfully fetch and return JSON data', async () => {
      const mockData = { success: true, data: 'test' };
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
        headers: new Headers({ 'X-Request-ID': mockRequestId }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      // Access private method
      const result = await ApiClient.fetchJSON(mockUrl, {
        method: 'GET',
        headers: { 'X-Request-ID': mockRequestId },
      });

      expect(result).toEqual(mockData);
      expect(global.fetch).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
        }),
      );
    });

    it('should set Content-Type header to application/json', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
        headers: new Headers(),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await ApiClient.fetchJSON(mockUrl, { method: 'POST' });

      const fetchCall = global.fetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('should add Authorization header when authToken is provided', async () => {
      const mockToken = 'test-auth-token';
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
        headers: new Headers(),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await ApiClient.fetchJSON(mockUrl, { method: 'GET' }, mockToken);

      const fetchCall = global.fetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers.get('Authorization')).toBe(`Bearer ${mockToken}`);
    });

    it('should throw error when Request ID does not match', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
        headers: new Headers({ 'X-Request-ID': 'different-id' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(
        ApiClient.fetchJSON(mockUrl, {
          method: 'GET',
          headers: { 'X-Request-ID': mockRequestId },
        }),
      ).rejects.toThrow('Request ID mismatch');
    });

    it('should not throw error when no Request ID is in request', async () => {
      const mockData = { success: true };
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
        headers: new Headers(),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await ApiClient.fetchJSON(mockUrl, {
        method: 'GET',
      });

      expect(result).toEqual(mockData);
    });

    it('should throw error when response is not ok (4xx error)', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(ApiClient.fetchJSON(mockUrl, { method: 'GET' })).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should throw error when response is not ok (5xx error)', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(ApiClient.fetchJSON(mockUrl, { method: 'POST' })).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should propagate network errors', async () => {
      const networkError = new Error('Network failure');
      global.fetch.mockRejectedValue(networkError);

      await expect(ApiClient.fetchJSON(mockUrl, { method: 'GET' })).rejects.toThrow('Network failure');
    });

    it('should merge existing headers with new ones', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
        headers: new Headers(),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await ApiClient.fetchJSON(mockUrl, {
        method: 'POST',
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      const fetchCall = global.fetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-Custom-Header')).toBe('custom-value');
    });
  });

  describe('register', () => {
    const mockServiceUrl = 'https://api.example.com';
    const mockSecretKey = new Uint8Array([1, 2, 3, 4]);
    const mockPayload = {
      accountId: 'test-account-id',
      username: 'testuser',
      deviceName: 'Test Device',
      devicePublicKey: 'mock-public-key',
      deviceEnvelopes: [],
      cipherRootFile: 'encrypted-root-file',
      otherPublicUserData: { foo: 'bar' },
    };

    const mockRegisterResponse = {
      ok: true,
      accountId: 'test-account-id',
      rootFile: { key: 'root-key', etag: 'root-etag' },
    };

    beforeEach(() => {
      CryptoUtils.sha256.mockResolvedValue('mock-sha256-hash');
      CryptoUtils.generateRandomUUID.mockReturnValue('mock-uuid');
      CryptoPQ.sign.mockReturnValue('mock-signature');

      // Mock Date.now()
      vi.spyOn(Date, 'now').mockReturnValue(1234567890000);
    });

    it('should successfully register with valid payload', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockRegisterResponse),
        headers: new Headers({ 'X-Request-ID': 'mock-uuid' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await ApiClient.register(mockServiceUrl, mockPayload, mockSecretKey);

      expect(result).toEqual(mockRegisterResponse);
      expect(CryptoUtils.sha256).toHaveBeenCalledWith(JSON.stringify(mockPayload), 'hex');
    });

    it('should generate correct signature with proper string format', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockRegisterResponse),
        headers: new Headers({ 'X-Request-ID': 'mock-uuid' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await ApiClient.register(mockServiceUrl, mockPayload, mockSecretKey);

      const expectedStringToSign = ['POST', '/register', 'mock-sha256-hash', '1234567890000', 'mock-uuid'].join('\n');

      expect(CryptoPQ.sign).toHaveBeenCalledWith(mockSecretKey, expectedStringToSign);
    });

    it('should include all required headers in request', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockRegisterResponse),
        headers: new Headers({ 'X-Request-ID': 'mock-uuid' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await ApiClient.register(mockServiceUrl, mockPayload, mockSecretKey);

      const fetchCall = global.fetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers.get('Content-SHA256')).toBe('mock-sha256-hash');
      expect(headers.get('X-Timestamp')).toBe('1234567890000');
      expect(headers.get('X-Request-ID')).toBe('mock-uuid');
      expect(headers.get('X-Signature')).toBe('Signature mock-signature');
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('should call correct endpoint with POST method', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockRegisterResponse),
        headers: new Headers({ 'X-Request-ID': 'mock-uuid' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await ApiClient.register(mockServiceUrl, mockPayload, mockSecretKey);

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockServiceUrl}/register`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockPayload),
        }),
      );
    });

    it('should handle registration failure response', async () => {
      const errorResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers({ 'X-Request-ID': 'mock-uuid' }),
      };

      global.fetch.mockResolvedValue(errorResponse);

      await expect(ApiClient.register(mockServiceUrl, mockPayload, mockSecretKey)).rejects.toThrow(
        'HTTP 400: Bad Request',
      );
    });

    it('should handle network errors during registration', async () => {
      const networkError = new Error('Connection timeout');
      global.fetch.mockRejectedValue(networkError);

      await expect(ApiClient.register(mockServiceUrl, mockPayload, mockSecretKey)).rejects.toThrow(
        'Connection timeout',
      );
    });

    it('should handle different timestamps correctly', async () => {
      const differentTimestamp = 9876543210000;
      vi.spyOn(Date, 'now').mockReturnValue(differentTimestamp);

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockRegisterResponse),
        headers: new Headers({ 'X-Request-ID': 'mock-uuid' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      await ApiClient.register(mockServiceUrl, mockPayload, mockSecretKey);

      const fetchCall = global.fetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers.get('X-Timestamp')).toBe(differentTimestamp.toString());
    });

    it('should handle payload with optional fields missing', async () => {
      const minimalPayload = {
        accountId: 'test-account-id',
        username: 'testuser',
        deviceName: 'Test Device',
        devicePublicKey: 'mock-public-key',
        deviceEnvelopes: [],
        cipherRootFile: 'encrypted-root-file',
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockRegisterResponse),
        headers: new Headers({ 'X-Request-ID': 'mock-uuid' }),
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await ApiClient.register(mockServiceUrl, minimalPayload, mockSecretKey);

      expect(result).toEqual(mockRegisterResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockServiceUrl}/register`,
        expect.objectContaining({
          body: JSON.stringify(minimalPayload),
        }),
      );
    });
  });
});
