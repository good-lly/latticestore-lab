'use strict';

import { ApiClient, RegisterRequest } from './ApiClient';
import { CryptoUtils } from './CryptoUtils';
import { AEAD } from './CryptoAEAD';
import { Helper } from './Helpers';
import { DeviceEnvelope, DeviceUtils, RECOVERY_DEVICE_NAME } from './DeviceUtils';

export class LatticeStoreClient {
  public async registerNewAccount(
    serviceUrl: string,
    username: string,
    deviceName: string,
    userMasterSeed: Uint8Array = new Uint8Array(),
  ) {
    try {
      if (!serviceUrl || !username || !deviceName) {
        throw new Error('Service URL, username, and device name are required');
      }
      const finalMasterSeed = userMasterSeed.length > 0 ? userMasterSeed : CryptoUtils.generateRandomBytes(32);
      const { kemSeed, dsaSeed } = CryptoUtils.deriveSeeds(finalMasterSeed);
      const masterKey = AEAD.generateRawAEADKeyData();

      const [thisDeviceCredentials, recoveryDevice] = await Promise.all([
        DeviceUtils.generateNewDeviceCredential(deviceName, masterKey),
        DeviceUtils.generateNewDeviceCredential(RECOVERY_DEVICE_NAME, masterKey, kemSeed, dsaSeed), // deterministic recovery device
      ]);

      const registerPayload: RegisterRequest = {
        accountId: Helper.uint8ArrayToHex(CryptoUtils.generateRandomBytes(32)),
        username: username.trim(),
        deviceName: deviceName,
        devicePublicKey: thisDeviceCredentials.dsaPublicKeyHex,
        deviceEnvelopes: [thisDeviceCredentials.envelope as DeviceEnvelope, recoveryDevice.envelope as DeviceEnvelope], // include device envelopes
        cipherRootFile: 'TODO', // Encrypt and include the root file
      };
      const request = await ApiClient.register(serviceUrl, registerPayload, thisDeviceCredentials.dsaSecretKey);
      if (!request.ok) {
        throw new Error(request.message || 'Registration failed');
      }
      return {
        accountId: request.accountId,
        rootFile: request.rootFile,
        deviceCredentials: thisDeviceCredentials,
        recoveryDeviceCredentials: recoveryDevice,
      };
    } catch (error) {
      throw error;
    }
  }

  public login() {
    try {
      // TODO
    } catch (error) {
      throw error;
    }
  }
}
