import { AccountData } from './Accounts';
import { CryptoPQ } from './CryptoPQ';
import { CryptoUtils } from './CryptoUtils';
import { DeviceEnvelope, ExtendedDeviceEnvelope } from './DeviceUtils';
import { uint8ArrayToBase64, generateCanonicalJSON } from './Helpers';
export type LoginRequest = {
  username: string;
  deviceId: string;
};

export type LoginResponse = {
  ok: boolean;
  accountInfo: AccountData;
  deviceEnvelope: ExtendedDeviceEnvelope;
  featuresList: string | null;
  authToken: string;
  message?: string;
  code: number;
  reqId: string;
};

export type RegisterRequest = {
  username: string;
  devicePublicKey: string;
  deviceEnvelopes: DeviceEnvelope[];
  deviceListFile: string;
  featuresList?: string | undefined;
  devices: string[];
  email?: string | undefined;
  otherPublicUserData?: Record<string, any> | undefined;
};

export type RegisterResponse = {
  ok: boolean;
  message: string;
  code: number;
  reqId: string;
};

export type UploadObjectRequest = {
  fileKey: string;
  fileContent: string;
  deviceAuthToken: string;
};

export type GetObjectRequest = {
  deviceAuthToken: string;
  objectKey: string;
  etag?: string | null;
};

export type ObjectResult = {
  ok: boolean;
  objectKey: string;
  cipherContent?: string;
  etag?: string;
  status?: string;
  reason?: string;
};

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

export const signedRequest = async (
  url: string,
  payload: RegisterRequest | LoginRequest,
  secretSignKey: Uint8Array,
): Promise<RegisterResponse | LoginResponse> => {
  const body = generateCanonicalJSON(payload);
  const contentSha256 = await CryptoUtils.sha256(body, 'hex');
  const timestamp = Date.now().toString();
  const requestId = CryptoUtils.generateRandomUUID();
  const stringToSign = [contentSha256, timestamp, requestId].join('\n');
  const headers: Record<string, any> = {
    'Content-SHA256': contentSha256 as string,
    'X-Timestamp': timestamp,
    'X-Request-ID': requestId,
    'X-Signature': `Signature ${uint8ArrayToBase64(CryptoPQ.sign(secretSignKey, stringToSign))}`,
  };
  return _fetchJSON<RegisterResponse | LoginResponse>(`${url}`, {
    method: 'POST',
    headers,
    body,
  });
};

// export const apiLogin = async (
//   serviceUrl: string,
//   payload: LoginRequest,
//   secretSignKey: Uint8Array,
// ): Promise<LoginResponse> => {
//   const body = generateCanonicalJSON(payload);
//   const contentSha256 = await CryptoUtils.sha256(body, 'hex');
//   const timestamp = Date.now().toString();
//   const requestId = CryptoUtils.generateRandomUUID();
//   const stringToSign = ['POST', '/login', contentSha256, timestamp, requestId].join('\n');
//   const headers: Record<string, any> = {
//     'Content-SHA256': contentSha256 as string,
//     'X-Timestamp': timestamp,
//     'X-Request-ID': requestId,
//     'X-Signature': `Signature ${uint8ArrayToBase64(CryptoPQ.sign(secretSignKey, stringToSign))}`,
//   };
//   return _fetchJSON<LoginResponse>(`${serviceUrl}/login`, {
//     method: 'POST',
//     headers,
//     body,
//   });
// };
