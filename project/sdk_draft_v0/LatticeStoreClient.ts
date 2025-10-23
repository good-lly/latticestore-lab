'use strict';

import { apiRegister, RegisterRequest } from './ApiClient';
import { CryptoUtils } from './CryptoUtils';
import { AEAD } from './CryptoAEAD';
import { DeviceEnvelope, DeviceUtils, RECOVERY_DEVICE_NAME } from './DeviceUtils';

export class LatticeStoreClient {
  public async registerNewAccount(
    serviceUrl: string,
    username: string,
    deviceName: string,
    thisDeviceMasterSeed: Uint8Array = new Uint8Array(),
    email?: string,
  ) {
    try {
      const thisFinalMasterSeed =
        thisDeviceMasterSeed.length > 0 ? thisDeviceMasterSeed : CryptoUtils.generateRandomBytes(128);
      const { kemSeed, dsaSeed } = CryptoUtils.deriveSeeds(thisFinalMasterSeed);
      const masterKey = AEAD.generateRawAEADKeyData();

      const [thisDeviceCredentials, recoveryDevice] = await Promise.all([
        DeviceUtils.generateNewDeviceCredential(deviceName, masterKey, kemSeed, dsaSeed), // local device is generated from user-provided seed
        DeviceUtils.generateNewDeviceCredential(RECOVERY_DEVICE_NAME, masterKey), // recovery device is always random!
      ]);

      const registerPayload: RegisterRequest = {
        username: username.trim(),
        devicePublicKey: thisDeviceCredentials.dsaPublicKeyBase64,
        deviceEnvelopes: [thisDeviceCredentials.envelope as DeviceEnvelope, recoveryDevice.envelope as DeviceEnvelope], // include device envelopes
        deviceListFile: await DeviceUtils.buildDeviceList([thisDeviceCredentials, recoveryDevice], masterKey),
        devices: [thisDeviceCredentials.deviceId, recoveryDevice.deviceId],
        email: email?.trim(),
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

  // public async login(serviceUrl: string, thisDeviceMasterSeed: Uint8Array = new Uint8Array()) {
  //   try {
  //     const { kemSeed, dsaSeed, accountId } = CryptoUtils.deriveSeeds(thisDeviceMasterSeed);
  //     const loginPayload: LoginRequest = {
  //       accountId: uint8ArrayToHex(accountId),
  //       username: username.trim(),
  //       devicePublicKey: thisDeviceCredentials.dsaPublicKeyBase64,
  //       deviceEnvelopes: [thisDeviceCredentials.envelope as DeviceEnvelope, recoveryDevice.envelope as DeviceEnvelope], // include device envelopes
  //       deviceListFile: await DeviceUtils.buildDeviceList([thisDeviceCredentials, recoveryDevice], masterKey),
  //       devices: [thisDeviceCredentials.deviceId, recoveryDevice.deviceId],
  //       email: email?.trim(),
  //     };
  //   } catch (error) {
  //     throw error;
  //   }
  // }
}
