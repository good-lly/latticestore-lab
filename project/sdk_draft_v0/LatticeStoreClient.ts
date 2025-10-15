'use strict';

import { apiRegister, RegisterRequest } from './ApiClient';
import { CryptoUtils } from './CryptoUtils';
import { AEAD } from './CryptoAEAD';
import { uint8ArrayToHex } from './Helpers';
import { DeviceEnvelope, DeviceUtils, RECOVERY_DEVICE_NAME } from './DeviceUtils';

export class LatticeStoreClient {
  public async registerNewAccount(
    serviceUrl: string,
    username: string,
    deviceName: string,
    thisDeviceMasterSeed: Uint8Array = new Uint8Array(),
  ) {
    try {
      const thisFinalMasterSeed =
        thisDeviceMasterSeed.length > 0 ? thisDeviceMasterSeed : CryptoUtils.generateRandomBytes(128);
      const { kemSeed, dsaSeed, accountId } = CryptoUtils.deriveSeeds(thisFinalMasterSeed);
      const masterKey = AEAD.generateRawAEADKeyData();

      const [thisDeviceCredentials, recoveryDevice] = await Promise.all([
        DeviceUtils.generateNewDeviceCredential(deviceName, masterKey, kemSeed, dsaSeed), // local device is generated from user-provided seed
        DeviceUtils.generateNewDeviceCredential(RECOVERY_DEVICE_NAME, masterKey), // recovery device is always random!
      ]);

      const registerPayload: RegisterRequest = {
        accountId: uint8ArrayToHex(accountId),
        username: username.trim(),
        deviceName: deviceName,
        devicePublicKey: thisDeviceCredentials.dsaPublicKeyBase64,
        deviceEnvelopes: [thisDeviceCredentials.envelope as DeviceEnvelope, recoveryDevice.envelope as DeviceEnvelope], // include device envelopes
        cipherRootFile: 'TODO', // Encrypt and include the root file
      };
      const request = await apiRegister(serviceUrl, registerPayload, thisDeviceCredentials.dsaSecretKey);
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
