import { CryptoPQ } from './CryptoPQ';
import { CryptoUtils } from './CryptoUtils';
import { DeviceEnvelope } from './DeviceUtils';
export interface LoginRequest {
  accountId: string;
}

export interface LoginResponse {
  ok: boolean;
  cipherRootFile?: string;
  cipherRootFileEtag?: string;
  deviceEnvelope?: DeviceEnvelope;
  message?: string;
}

export interface RegisterRequest {
  accountId: string;
  username: string;
  deviceName: string;
  devicePublicKey: string;
  deviceEnvelopes: DeviceEnvelope[];
  cipherRootFile: string;
  otherPublicUserData?: Record<string, any>;
}

export interface RegisterResponse {
  ok: boolean;
  accountId: string;
  rootFile: { key: string; etag: string };
  message?: string;
}

export interface UploadObjectRequest {
  fileKey: string;
  fileContent: string;
  deviceAuthToken: string;
}

export interface GetObjectRequest {
  deviceAuthToken: string;
  objectKey: string;
  etag?: string | null;
}

export interface ObjectResult {
  ok: boolean;
  objectKey: string;
  cipherContent?: string;
  etag?: string;
  status?: string;
  reason?: string;
}

export class ApiClient {
  private constructor() {} // Prevent instantiation

  private static async fetchJSON<T>(url: string, options: RequestInit, authToken?: string): Promise<T> {
    const headers = new Headers(options.headers);
    const requestId = headers.get('X-Request-ID');
    headers.set('Content-Type', 'application/json');
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    const response = await fetch(url, { ...options, headers });
    if (requestId && response.headers.get('X-Request-ID') !== requestId) {
      throw new Error('Request ID mismatch');
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  public static async login(
    serviceUrl: string,
    payload: LoginRequest,
    secretSignKey: Uint8Array,
  ): Promise<LoginResponse> {
    const body = JSON.stringify(payload);
    const contentSha256 = await CryptoUtils.sha256(body, 'hex');
    const timestamp = Date.now().toString();
    const requestId = CryptoUtils.generateRandomUUID();
    const stringToSign = ['POST', '/login', contentSha256, timestamp, requestId].join('\n');
    const headers: Record<string, any> = {
      'Content-SHA256': contentSha256 as string,
      'X-Timestamp': timestamp,
      'X-Request-ID': requestId,
      'X-Signature': `Signature ${CryptoPQ.sign(secretSignKey, stringToSign)}`,
    };
    return this.fetchJSON<LoginResponse>(`${serviceUrl}/login`, {
      method: 'POST',
      headers,
      body,
    });
  }

  public static async register(
    serviceUrl: string,
    payload: RegisterRequest,
    secretSignKey: Uint8Array,
  ): Promise<RegisterResponse> {
    const body = JSON.stringify(payload);
    const contentSha256 = await CryptoUtils.sha256(body, 'hex');
    const timestamp = Date.now().toString();
    const requestId = CryptoUtils.generateRandomUUID();
    const stringToSign = ['POST', '/register', contentSha256, timestamp, requestId].join('\n');
    const headers: Record<string, any> = {
      'Content-SHA256': contentSha256 as string,
      'X-Timestamp': timestamp,
      'X-Request-ID': requestId,
      'X-Signature': `Signature ${CryptoPQ.sign(secretSignKey, stringToSign)}`,
    };
    return this.fetchJSON<RegisterResponse>(`${serviceUrl}/register`, {
      method: 'POST',
      headers,
      body,
    });
  }

  static async uploadObject(
    serviceUrl: string,
    objectKey: string,
    content: string,
    authToken: string,
  ): Promise<{ key: string; etag: string }> {
    const response = await this.fetchJSON<{ ok: boolean; etag: string }>(
      `${serviceUrl}/upload-file`,
      {
        method: 'POST',
        body: JSON.stringify({
          fileKey: objectKey,
          fileContent: content,
          deviceAuthToken: authToken,
        } as UploadObjectRequest),
      },
      CryptoUtils.generateRandomUUID(),
    );

    if (!response.ok || !response.etag) {
      throw new Error('Invalid upload response');
    }

    return { key: objectKey, etag: response.etag };
  }

  static async getObject(
    serviceUrl: string,
    objectKey: string,
    authToken: string,
    etag?: string | null,
  ): Promise<ObjectResult> {
    return this.fetchJSON<ObjectResult>(
      `${serviceUrl}/get-object`,
      {
        method: 'POST',
        body: JSON.stringify({
          deviceAuthToken: authToken,
          objectKey,
          etag,
        } as GetObjectRequest),
      },
      CryptoUtils.generateRandomUUID(),
    );
  }

  static async getObjects(
    serviceUrl: string,
    objectKeys: Array<{ objectKey: string; etag?: string | null }>,
    authToken: string,
  ): Promise<PromiseSettledResult<ObjectResult>[]> {
    if (!Array.isArray(objectKeys) || objectKeys.length === 0) {
      throw new Error('objectKeys must be a non-empty array');
    }

    const fetchPromises = objectKeys.map(({ objectKey, etag }) =>
      this.getObject(serviceUrl, objectKey, authToken, etag),
    );

    return Promise.allSettled(fetchPromises);
  }

  public static async logout(serviceUrl: string, authToken: string): Promise<{ ok: boolean }> {
    return this.fetchJSON(
      `${serviceUrl}/logout`,
      {
        method: 'POST',
        body: JSON.stringify({ deviceAuthToken: authToken }),
      },
      CryptoUtils.generateRandomUUID(),
    );
  }

  // TODO
  // SSE streaming (optional - only if needed)
  //   static createSSEStream(
  //     serviceUrl: string,
  //     authToken: string,
  //     onMessage: (data: any) => void,
  //     onError: (error: Error) => void,
  //     signal?: AbortSignal,
  //   ): void {
  //     fetch(`${serviceUrl}/sse-updates`, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'text/event-stream',
  //         'Cache-Control': 'no-cache',
  //         Connection: 'keep-alive',
  //       },
  //       body: JSON.stringify({ deviceAuthToken: authToken }),
  //       signal,
  //     })
  //       .then(async response => {
  //         if (!response.body) throw new Error('No response body');

  //         const reader = response.body.getReader();
  //         const decoder = new TextDecoder();

  //         while (true) {
  //           const { done, value } = await reader.read();
  //           if (done) break;

  //           const chunk = decoder.decode(value);
  //           const lines = chunk.split('\n');

  //           for (const line of lines) {
  //             if (line.startsWith('data: ')) {
  //               try {
  //                 const data = JSON.parse(line.slice(6));
  //                 onMessage(data);
  //               } catch (e) {
  //                 console.warn('Failed to parse SSE data:', e);
  //               }
  //             }
  //           }
  //         }
  //       })
  //       .catch(onError);
  //   }
}
