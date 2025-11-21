'use strict';

import { signedRequest } from './ApiClient';
import type { LoginResponse, LoginRequest, RegisterRequest } from './ApiClient';

import { CryptoUtils } from './CryptoUtils';
import { AEAD, RawAEADKey } from './CryptoAEAD';

import { DeviceUtils, RECOVERY_DEVICE_NAME } from './DeviceUtils';
import type { DeviceEnvelope, ExtendedDeviceEnvelope } from './DeviceUtils';

import { Account } from './Account';
import { base64ToUint8Array, fromUint8Array, toUint8Array } from './Helpers';

import { CUSTOM_DEVICE_LIST_STRING, CUSTOM_FEATURES_LIST_STRING, DEFAULT_AEAD_KEY_LENGTH_BYTES } from './Consts';

async function _verifySecurityContext() {
  const checks = {
    crossOriginIsolated: window.crossOriginIsolated,
    secureContext: window.isSecureContext,
    https: location.protocol === 'https:',
  };

  console.log('Security Context:', checks);

  if (!checks.crossOriginIsolated) {
    console.warn('⚠️ Not cross-origin isolated - vulnerable config');
    console.warn('Check COOP/COEP headers are set correctly');
  }

  if (!checks.secureContext) {
    console.error('❌ Not a secure context - WebCrypto limited');
  }

  return checks;
}

export class LatticeStoreClient {
  constructor() {
    _verifySecurityContext();
  }
  public async registerNewAccount(
    serviceUrl: string,
    username: string,
    deviceName: string,
    masterSeedString: string,
    email?: string,
  ) {
    try {
      const thisFinalMasterSeed =
        masterSeedString.length > 0
          ? toUint8Array(masterSeedString)
          : CryptoUtils.generateRandomBytes(DEFAULT_AEAD_KEY_LENGTH_BYTES);
      const { kemSeed, dsaSeed } = CryptoUtils.deriveSeeds(thisFinalMasterSeed);
      const recoverySeed = CryptoUtils.generateRandomBytes(DEFAULT_AEAD_KEY_LENGTH_BYTES);
      const recoverySeedsPair = CryptoUtils.deriveSeeds(recoverySeed);
      const masterKey = AEAD.generateRawAEADKeyData();
      const [thisDeviceCredentials, recoveryDevice] = await Promise.all([
        DeviceUtils.generateNewDeviceCredential(masterKey, kemSeed, dsaSeed), // local device is generated from user-provided seed
        DeviceUtils.generateNewDeviceCredential(masterKey, recoverySeedsPair.kemSeed, recoverySeedsPair.dsaSeed), // recovery device is always random!
      ]);
      thisDeviceCredentials.deviceName = deviceName.trim();
      recoveryDevice.deviceName = RECOVERY_DEVICE_NAME;
      const deviceListKey = CryptoUtils.letscShake256(
        masterKey,
        toUint8Array(CUSTOM_DEVICE_LIST_STRING),
        DEFAULT_AEAD_KEY_LENGTH_BYTES,
      );
      const registerPayload: RegisterRequest = {
        username: username.trim(),
        devicePublicKey: thisDeviceCredentials.dsaPublicKeyBase64,
        deviceEnvelopes: [thisDeviceCredentials.envelope as DeviceEnvelope, recoveryDevice.envelope as DeviceEnvelope], // include device envelopes
        deviceListFile: await DeviceUtils.buildDeviceList([thisDeviceCredentials, recoveryDevice], deviceListKey),
        devices: [thisDeviceCredentials.deviceId, recoveryDevice.deviceId],
        email: email?.trim(),
      };
      masterKey.fill(0); // Clear master key from memory
      thisFinalMasterSeed.fill(0); // Clear master seed from memory
      deviceListKey.fill(0);
      recoverySeedsPair.kemSeed.fill(0);
      recoverySeedsPair.dsaSeed.fill(0);
      kemSeed.fill(0);
      dsaSeed.fill(0);
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
        recoverySeed: recoverySeed,
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
      // thisDeviceMasterSeed.fill(0);
      const thisDeviceCredentials = await DeviceUtils.getDeviceCredentialsFromSeeds(kemSeed, dsaSeed);
      const loginPayload: LoginRequest = {
        username: username,
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
      const deviceListKeyMaterial = CryptoUtils.letscShake256(
        masterKey,
        toUint8Array(CUSTOM_DEVICE_LIST_STRING),
        DEFAULT_AEAD_KEY_LENGTH_BYTES,
      ) as RawAEADKey;
      const featuresListKeyMaterial = CryptoUtils.letscShake256(
        masterKey,
        toUint8Array(CUSTOM_FEATURES_LIST_STRING),
        DEFAULT_AEAD_KEY_LENGTH_BYTES,
      ) as RawAEADKey;
      const [deviceListKey, featureListKey] = await Promise.all([
        AEAD.importAEADKey(deviceListKeyMaterial),
        AEAD.importAEADKey(featuresListKeyMaterial),
      ]);
      const deviceList = JSON.parse(
        fromUint8Array(await AEAD.decrypt(deviceListKey, base64ToUint8Array(response.deviceEnvelope.deviceListBase64))),
      );

      const featuresList = response.featuresList
        ? JSON.parse(fromUint8Array(await AEAD.decrypt(featureListKey, base64ToUint8Array(response.featuresList))))
        : [];
      if (!response.accountInfo.username) {
        throw new Error('Username missing in account info');
      }
      if (thisDeviceCredentials.deviceId !== response.deviceEnvelope.deviceId) {
        throw new Error('Device ID mismatch during login');
      }
      masterKey.fill(0);
      deviceListKeyMaterial.fill(0);
      featuresListKeyMaterial.fill(0);
      kemSeed.fill(0);
      dsaSeed.fill(0);
      return new Account(
        thisDeviceCredentials,
        response.accountInfo,
        deviceListKey,
        deviceList,
        featureListKey,
        featuresList,
        response.authToken,
      );
    } catch (error) {
      throw error;
    }
  }
}
