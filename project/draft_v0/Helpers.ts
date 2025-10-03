export class Helper {
  public static encoder = new TextEncoder();
  public static decoder = new TextDecoder();

  /** Converts a string to a Uint8Array using UTF-8 encoding. */
  static toUint8Array(data: string): Uint8Array {
    return this.encoder.encode(data);
  }

  /** Converts a Uint8Array back to a string using UTF-8 decoding. */
  static fromUint8Array(data: Uint8Array): string {
    return this.decoder.decode(data);
  }
}
