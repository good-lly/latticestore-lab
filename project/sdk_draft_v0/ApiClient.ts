import { CryptoPQ } from './CryptoPQ';
import { CryptoUtils } from './CryptoUtils';
import { DeviceEnvelope } from './DeviceUtils';
import { uint8ArrayToBase64, generateCanonicalJSON } from './Helpers';
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
  username: string;
  devicePublicKey: string;
  deviceEnvelopes: DeviceEnvelope[];
  deviceListFile: string;
  devices: string[];
  email?: string | undefined;
  otherPublicUserData?: Record<string, any> | undefined;
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

const _fetchJSON = async <T>(url: string, options: RequestInit, authToken?: string): Promise<T> => {
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

  return response.json() as Promise<T>;
};

export const apiLogin = async (
  serviceUrl: string,
  payload: LoginRequest,
  secretSignKey: Uint8Array,
): Promise<LoginResponse> => {
  const body = JSON.stringify(payload);
  const contentSha256 = await CryptoUtils.sha256(body, 'hex');
  const timestamp = Date.now().toString();
  const requestId = CryptoUtils.generateRandomUUID();
  const stringToSign = ['POST', '/login', contentSha256, timestamp, requestId].join('\n');
  const headers: Record<string, any> = {
    'Content-SHA256': contentSha256 as string,
    'X-Timestamp': timestamp,
    'X-Request-ID': requestId,
    'X-Signature': `Signature ${uint8ArrayToBase64(CryptoPQ.sign(secretSignKey, stringToSign))}`,
  };
  return _fetchJSON<LoginResponse>(`${serviceUrl}/login`, {
    method: 'POST',
    headers,
    body,
  });
};

export const apiRegister = async (
  serviceUrl: string,
  payload: RegisterRequest,
  secretSignKey: Uint8Array,
): Promise<RegisterResponse> => {
  const body = generateCanonicalJSON(payload);
  const contentSha256 = await CryptoUtils.sha256(body, 'hex');
  const timestamp = Date.now().toString();
  const requestId = CryptoUtils.generateRandomUUID();
  const stringToSign = ['POST', '/register', contentSha256, timestamp, requestId].join('\n');
  const headers: Record<string, any> = {
    'Content-SHA256': contentSha256 as string,
    'X-Timestamp': timestamp,
    'X-Request-ID': requestId,
    'X-Signature': `Signature ${uint8ArrayToBase64(CryptoPQ.sign(secretSignKey, stringToSign))}`,
  };
  return _fetchJSON<RegisterResponse>(`${serviceUrl}/register`, {
    method: 'POST',
    headers,
    body,
  });
};
