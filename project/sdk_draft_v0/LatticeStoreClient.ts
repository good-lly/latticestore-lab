'use strict';

import { signedRequest, RegisterRequest, LoginRequest } from './ApiClient';
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
        DeviceUtils.generateNewDeviceCredential(masterKey, kemSeed, dsaSeed), // local device is generated from user-provided seed
        DeviceUtils.generateNewDeviceCredential(masterKey), // recovery device is always random!
      ]);
      thisDeviceCredentials.deviceName = deviceName.trim();
      recoveryDevice.deviceName = RECOVERY_DEVICE_NAME;

      const registerPayload: RegisterRequest = {
        username: username.trim(),
        devicePublicKey: thisDeviceCredentials.dsaPublicKeyBase64,
        deviceEnvelopes: [thisDeviceCredentials.envelope as DeviceEnvelope, recoveryDevice.envelope as DeviceEnvelope], // include device envelopes
        deviceListFile: await DeviceUtils.buildDeviceList([thisDeviceCredentials, recoveryDevice], masterKey),
        devices: [thisDeviceCredentials.deviceId, recoveryDevice.deviceId],
        email: email?.trim(),
      };
      const request = await signedRequest(
        `${serviceUrl}/register`,
        registerPayload,
        thisDeviceCredentials.dsaSecretKey,
      );
      if (!request.ok) {
        throw new Error(request.message || 'Registration failed');
      }
      return {
        accountId: request.accountId,
        deviceCredentials: thisDeviceCredentials,
        recoveryDeviceCredentials: recoveryDevice,
      };
    } catch (error) {
      throw error;
    }
  }

  public async login(serviceUrl: string, username: string, thisDeviceMasterSeed: Uint8Array = new Uint8Array()) {
    try {
      const { kemSeed, dsaSeed } = CryptoUtils.deriveSeeds(thisDeviceMasterSeed);
      const thisDeviceCredentials = await DeviceUtils.getDeviceCredentialsFromSeeds(kemSeed, dsaSeed);
      const loginPayload: LoginRequest = {
        username: username.trim(),
        deviceId: thisDeviceCredentials.deviceId,
      };
      const request = await signedRequest(`${serviceUrl}/login`, loginPayload, thisDeviceCredentials.dsaSecretKey);
      if (!request.ok) {
        throw new Error(request.message || 'Login failed');
      }
    } catch (error) {
      throw error;
    }
  }
}
