'use strict';

import { signedRequest } from './ApiClient';
import type { LoginResponse, LoginRequest, RegisterRequest } from './ApiClient';

import { CryptoUtils } from './CryptoUtils';
import { AEAD } from './CryptoAEAD';

import { DeviceUtils, RECOVERY_DEVICE_NAME } from './DeviceUtils';
import type { DeviceEnvelope, ExtendedDeviceEnvelope } from './DeviceUtils';

import { Account } from './Account';
import { base64ToUint8Array, fromUint8Array } from './Helpers';

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
      thisDeviceMasterSeed.fill(0); // Clear initial seed from memory, just in case
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
      masterKey.fill(0); // Clear master key from memory
      thisFinalMasterSeed.fill(0); // Clear master seed from memory
      const response = await signedRequest(
        `${serviceUrl}/register`,
        registerPayload,
        thisDeviceCredentials.dsaSecretKey,
      );
      if (!response.ok) {
        throw new Error(response.message || 'Registration failed');
      }
      return {
        ok: response.ok,
        deviceCredentials: thisDeviceCredentials,
        recoveryDeviceCredentials: recoveryDevice,
      };
    } catch (error) {
      throw error;
    }
  }

  public async login(
    serviceUrl: string,
    username: string,
    thisDeviceMasterSeed: Uint8Array = new Uint8Array(),
  ): Promise<Account> {
    try {
      const { kemSeed, dsaSeed } = CryptoUtils.deriveSeeds(thisDeviceMasterSeed);
      thisDeviceMasterSeed.fill(0);
      const thisDeviceCredentials = await DeviceUtils.getDeviceCredentialsFromSeeds(kemSeed, dsaSeed);
      const loginPayload: LoginRequest = {
        username: username.trim(),
        deviceId: thisDeviceCredentials.deviceId,
      };
      const response = (await signedRequest(
        `${serviceUrl}/login`,
        loginPayload,
        thisDeviceCredentials.dsaSecretKey,
      )) as LoginResponse;
      if (!response.ok) {
        throw new Error(response.message || 'Login failed');
      }
      const masterKey = await DeviceUtils.recoverMasterKey(response.deviceEnvelope as ExtendedDeviceEnvelope, kemSeed);
      const aeadKey = await AEAD.importAEADKey(masterKey);
      masterKey.fill(0);
      const deviceList = JSON.parse(
        fromUint8Array(await AEAD.decrypt(aeadKey, base64ToUint8Array(response.deviceEnvelope.deviceListBase64))),
      );
      const featuresList = response.featuresList
        ? JSON.parse(fromUint8Array(await AEAD.decrypt(aeadKey, base64ToUint8Array(response.featuresList))))
        : [];
      if (!response.accountInfo.username || response.accountInfo.username !== username.trim()) {
        throw new Error('Username mismatch during login');
      }
      if (thisDeviceCredentials.deviceId !== response.deviceEnvelope.deviceId) {
        throw new Error('Device ID mismatch during login');
      }
      return new Account(
        thisDeviceCredentials,
        response.accountInfo,
        deviceList,
        featuresList,
        aeadKey,
        response.authToken,
      );
    } catch (error) {
      throw error;
    }
  }
}
