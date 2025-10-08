import { CryptoPQ } from './CryptoPQ';
import { CryptoUtils } from './CryptoUtils';
import { AEAD, RawAEADKey } from './CryptoAEAD';
import { Helper } from './Helpers';

export const RECOVERY_DEVICE_NAME = 'RECOVERY_DEVICE';

// Device envelope which holds the public keys and encrypted master key
export interface DeviceEnvelope {
  deviceId: string;
  // dsaPublicKeyHex: string; // hex encoded
  kemPublicKeyHex: string; // hex encoded
  encryptedMasterKeyHex: string; // hex - AES-GCM encrypted
  cipherTextHex: string; // hex encoded - ciphertext from KEM encapsulation
}

// Credentials for a device including keys and seeds - never leave the client
export interface DeviceCredentials {
  deviceId: string;
  deviceName: string;
  dsaPublicKeyHex: string; // hex encoded
  dsaSecretKey: Uint8Array;
  _seeds: {
    kem: Uint8Array;
    dsa: Uint8Array;
  };
  envelope?: DeviceEnvelope; // Optional envelope for server registration
}

export class DeviceUtils {
  private constructor() {} // Prevent instantiation

  public static async generateNewDeviceCredential(
    deviceName: string,
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

    const name = deviceName.trim();
    // Derived device ID from DSA public key - verifiable identity
    const deviceId = (await CryptoUtils.sha256(dsaKeys.publicKey as Uint8Array<ArrayBuffer>, 'hex')) as string;

    return {
      deviceId,
      deviceName: name,
      dsaPublicKeyHex: Helper.uint8ArrayToHex(dsaKeys.publicKey),
      dsaSecretKey: dsaKeys.secretKey,
      _seeds: {
        kem: finalKemSeed,
        dsa: finalDsaSeed,
      },
      envelope: {
        deviceId,
        // dsaPublicKeyHex: Helper.uint8ArrayToHex(dsaKeys.publicKey),
        kemPublicKeyHex: Helper.uint8ArrayToHex(kemKeys.publicKey),
        encryptedMasterKeyHex: Helper.uint8ArrayToHex(encryptedMasterKey),
        cipherTextHex: Helper.uint8ArrayToHex(cipherText),
      },
    };
  }
}
