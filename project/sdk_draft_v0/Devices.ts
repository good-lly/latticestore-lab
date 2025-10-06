interface IDevice {
  readonly deviceId: string;
  readonly deviceAlias: string;
  readonly createdAt: Date;
  readonly publicKey: Uint8Array;
}
export class RemoteDeviceIdentity implements IDevice {
  readonly deviceId: string;
  readonly deviceAlias: string;
  readonly createdAt: Date;
  private lastActiveAt: Date;
  readonly publicKey: Uint8Array;

  constructor(deviceId: string, deviceAlias: string, createdAt: Date, lastActiveAt: Date, publicKey: Uint8Array) {
    this.deviceId = deviceId;
    this.deviceAlias = deviceAlias;
    this.createdAt = createdAt;
    this.lastActiveAt = lastActiveAt;
    this.publicKey = publicKey;
  }
}
