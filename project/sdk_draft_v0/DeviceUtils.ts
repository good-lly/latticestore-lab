import { CryptoPQ } from './CryptoPQ';
import { CryptoUtils } from './CryptoUtils';
import { AEAD, RawAEADKey } from './CryptoAEAD';
import { uint8ArrayToHex, uint8ArrayToBase64, toUint8Array } from './Helpers';

export const RECOVERY_DEVICE_NAME = 'RECOVERY_DEVICE';

// Device envelope which holds the public keys and encrypted master key
export type DeviceEnvelope = {
  deviceId: string;
  dsaPublicKeyBase64: string; // base64 encoded
  encryptedMasterKeyHex: string; // hex - AES-GCM encrypted
  cipherTextHex: string; // hex encoded - ciphertext from KEM encapsulation
};

// Credentials for a device including keys and seeds - never leave the client
export type DeviceCredentials = {
  deviceId: string;
  deviceName?: string;
  dsaPublicKeyBase64: string; // base64 encoded
  dsaSecretKey: Uint8Array;
  kemPublicKey: Uint8Array;
  _seeds: {
    kem: Uint8Array;
    dsa: Uint8Array;
  };
  envelope?: DeviceEnvelope; // Optional envelope for server registration
};

export class DeviceUtils {
  private constructor() {} // Prevent instantiation

  public static async generateNewDeviceCredential(
    masterKey: Uint8Array,
    kemSeed?: Uint8Array,
    dsaSeed?: Uint8Array,
  ): Promise<DeviceCredentials> {
    // TODO: we need to come up with KDF for seeds from single seed input
    const finalKemSeed = kemSeed || CryptoUtils.generateRandomBytes(64);
    const finalDsaSeed = dsaSeed || CryptoUtils.generateRandomBytes(32);

    const kemKeys = CryptoPQ.generateKemKeys(finalKemSeed);
    const { cipherText, sharedSecret } = CryptoPQ.encapsulate(kemKeys.publicKey);
    const aeadSharedKey = await AEAD.importAEADKey(sharedSecret as RawAEADKey);
    sharedSecret.fill(0); // Clear shared secret from memory

    const encryptedMasterKey = await AEAD.encrypt(aeadSharedKey, masterKey as Uint8Array<ArrayBuffer>);

    const dsaKeys = CryptoPQ.generateDsaKeys(finalDsaSeed);
    // Derived device ID from DSA public key - verifiable identity
    const deviceId = (await CryptoUtils.sha256(dsaKeys.publicKey as Uint8Array<ArrayBuffer>, 'hex')) as string;

    return {
      deviceId,
      dsaPublicKeyBase64: uint8ArrayToBase64(dsaKeys.publicKey),
      dsaSecretKey: dsaKeys.secretKey,
      kemPublicKey: kemKeys.publicKey,
      _seeds: {
        kem: finalKemSeed,
        dsa: finalDsaSeed,
      },
      envelope: {
        deviceId,
        dsaPublicKeyBase64: uint8ArrayToBase64(dsaKeys.publicKey),
        encryptedMasterKeyHex: uint8ArrayToHex(encryptedMasterKey),
        cipherTextHex: uint8ArrayToHex(cipherText),
      },
    };
  }

  public static buildDeviceList = async (devices: DeviceCredentials[], masterKey: Uint8Array): Promise<string> => {
    const deviceList = devices.map(device => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      kemPublicKeyHex: uint8ArrayToHex(device.kemPublicKey),
    }));
    const deviceListUint8Array = toUint8Array(JSON.stringify(deviceList));
    const aeadMasterKey = await AEAD.importAEADKey(masterKey as RawAEADKey);
    const encryptedDL = await AEAD.encrypt(aeadMasterKey, deviceListUint8Array as Uint8Array<ArrayBuffer>);
    return uint8ArrayToBase64(encryptedDL);
  };

  public static async getDeviceCredentialsFromSeeds(
    kemSeed: Uint8Array,
    dsaSeed: Uint8Array,
  ): Promise<DeviceCredentials> {
    const kemKeys = CryptoPQ.generateKemKeys(kemSeed);
    const dsaKeys = CryptoPQ.generateDsaKeys(dsaSeed);
    const deviceId = (await CryptoUtils.sha256(dsaKeys.publicKey as Uint8Array<ArrayBuffer>, 'hex')) as string;
    return {
      deviceId,
      dsaPublicKeyBase64: uint8ArrayToBase64(dsaKeys.publicKey),
      dsaSecretKey: dsaKeys.secretKey,
      kemPublicKey: kemKeys.publicKey,
      _seeds: {
        kem: kemSeed,
        dsa: dsaSeed,
      },
    };
  }
}
