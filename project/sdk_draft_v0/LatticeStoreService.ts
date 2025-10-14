import { CryptoUtils } from './CryptoUtils';
import { RegisterRequest } from './ApiClient';
import { CryptoPQ, ML_DSA_PUBLIC_KEY_SIZE, ML_DSA_SIGNATURE_SIZE } from './CryptoPQ';
import { Helper } from './Helpers';
import { S3Config } from 's3mini';
import * as CONST from './Consts';
export class LatticeStoreService {
  private S3client: S3Config;
  private keyvStore: any;

  constructor(S3client: S3Config, keyvStore: any) {
    this.S3client = S3client;
    this.keyvStore = keyvStore;
  }
  private static validateTimestamp(clientTime: number): boolean {
    const serverTime = Date.now();
    const timeDiff = Math.abs(serverTime - clientTime);
    if (timeDiff > CONST.TIMESTAMP_TOLERANCE_MS) {
      throw new Error('Timestamp is out of acceptable range');
    }
    return true;
  }

  private static isValidRegistrationHeaders(headers: Headers): boolean {
    for (const header of CONST.REQUIRED_REGISTER_HEADERS) {
      if (!headers.has(header)) {
        return false;
      }
    }
    const clientTime = parseInt(headers.get('X-Timestamp') || '0', 10);
    const isValidTimestamp = this.validateTimestamp(clientTime);
    if (!isValidTimestamp) {
      throw new Error('Invalid timestamp');
    }
    return true;
  }

  private static isValidRegistrationPayload(body: RegisterRequest): boolean {
    for (const field of CONST.REQUIRED_REGISTER_PAYLOAD_FIELDS) {
      if (!(field in body)) {
        return false;
      }
    }
    const accountId = body['accountId'];
    if (typeof accountId !== 'string' || !/^[a-f0-9]{64}$/.test(accountId)) {
      return false;
    }
    return true;
  }

  private static isValidRegistrationSignature(headers: Headers, payload: RegisterRequest): boolean {
    const clientTime = parseInt(headers.get('X-Timestamp') || '0', 10);
    const requestId = headers.get('X-Request-ID') || '';
    const contentSha256 = headers.get('Content-SHA256') || '';
    const stringToSign = ['POST', '/register', contentSha256, clientTime, requestId].join('\n');
    const signatureHeader = headers.get('X-Signature');
    if (!signatureHeader || !signatureHeader.startsWith('Signature ')) {
      return false;
    }
    const signature = signatureHeader.split(' ')[1];
    // convert signature from base64 to Uint8Array
    const signatureBytes = Helper.base64ToUint8Array(signature as string);
    if (signatureBytes.length !== ML_DSA_SIGNATURE_SIZE) {
      throw new Error('Invalid signature length');
    }
    // convert devicePublicKey from base64 to Uint8Array
    const devicePublicKey = Helper.base64ToUint8Array(payload.devicePublicKey);
    if (devicePublicKey.length !== ML_DSA_PUBLIC_KEY_SIZE) {
      throw new Error('Invalid public key length');
    }
    // verify signature
    const messageToVerify = Helper.toUint8Array(stringToSign);
    const isValidSignature = CryptoPQ.verifySignature(devicePublicKey, messageToVerify, signatureBytes);
    return isValidSignature;
  }

  private static async validateRegistrationRequest(headers: Headers, body: RegisterRequest) {
    const validHeaders = this.isValidRegistrationHeaders(headers);
    if (!validHeaders) {
      throw new Error('Invalid headers for registration');
    }
    const validPayload = this.isValidRegistrationPayload(body);
    if (!validPayload) {
      throw new Error('Invalid registration payload');
    }
    const payloadString = Helper.generateCanonicalJSON(body);
    const calculatedSha256 = await CryptoUtils.sha256(payloadString, 'hex');
    const contentSha256 = headers.get('Content-SHA256');
    if (calculatedSha256 !== contentSha256) {
      throw new Error('Content SHA256 mismatch');
    }
    const isValidSignature = this.isValidRegistrationSignature(headers, body);
    if (!isValidSignature) {
      throw new Error('Invalid signature for registration');
    }
    return true;
  }

  public static async handleRegisterRequest(headers: Headers, body: RegisterRequest) {
    try {
      const isValid = await this.validateRegistrationRequest(headers, body);
    } catch (error) {
      throw new Error(`Registration request validation failed: ${(error as Error).message}`);
    }
  }
}
