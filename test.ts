// Mock Cryptographic Primitives
// In production, replace with actual ML-KEM (Kyber) and ML-DSA (Dilithium)
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';

type AEADKey = Uint8Array & { readonly __brand: 'AEADKey' };
type SecretKey = Uint8Array & { readonly __brand: 'SecretKey' };
type SigningPublicKey = Uint8Array & { readonly __brand: 'SigningPublicKey' };
type Signature = Uint8Array & { readonly __brand: 'Signature' };
type EncryptionPrivateKey = Uint8Array & { readonly __brand: 'EncryptionPrivateKey' };
type EncryptionPublicKey = Uint8Array & { readonly __brand: 'EncryptionPublicKey' };
type EncryptionCiphertext = Uint8Array & { readonly __brand: 'EncryptionCiphertext' };

class AEAD {
  static generateKey(): AEADKey {
    return crypto.getRandomValues(new Uint8Array(32)) as AEADKey;
  }

  static encrypt(key: AEADKey, plaintext: Uint8Array): Uint8Array {
    const result = new Uint8Array(key.length + plaintext.length);
    result.set(key, 0);
    result.set(plaintext, key.length);
    return result;
  }

  static decrypt(key: AEADKey, ciphertext: Uint8Array): Uint8Array {
    // Check key matches
    for (let i = 0; i < 16; i++) {
      if (ciphertext[i] !== key[i]) {
        throw new Error('Invalid key');
      }
    }
    return ciphertext.slice(16);
  }
}

// Mock implementations of ML-DSA - following the https://github.com/paulmillr/noble-post-quantum?tab=readme-ov-file#ml-dsa--dilithium-signatures
class Signing {
  static generateKeyPair(): [SecretKey, SigningPublicKey] {
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const keys = ml_dsa87.keygen(seed);
    return [keys.secretKey as SecretKey, keys.publicKey as SigningPublicKey];
  }

  static sign(privateKey: SecretKey, message: Uint8Array): Signature {
    return ml_dsa87.sign(privateKey, message) as Signature;
  }

  static isValid(publicKey: SigningPublicKey, message: Uint8Array, signature: Signature): boolean {
    return ml_dsa87.verify(publicKey, message, signature);
  }
}

class Encryption {
  static generateKeyPair(): [EncryptionPrivateKey, EncryptionPublicKey] {
    const privateKey = crypto.getRandomValues(new Uint8Array(4)) as EncryptionPrivateKey;
    return [privateKey, privateKey as EncryptionPublicKey];
  }

  static encrypt(publicKey: EncryptionPublicKey, plaintext: Uint8Array): EncryptionCiphertext {
    const result = new Uint8Array(publicKey.length + plaintext.length);
    result.set(publicKey, 0);
    result.set(plaintext, publicKey.length);
    return result as EncryptionCiphertext;
  }

  static decrypt(privateKey: EncryptionPrivateKey, ciphertext: EncryptionCiphertext): Uint8Array {
    for (let i = 0; i < 4; i++) {
      if (ciphertext[i] !== privateKey[i]) {
        throw new Error('Invalid key');
      }
    }
    return ciphertext.slice(4);
  }
}

// Utility functions for serialization
function serialize(obj: any): Uint8Array {
  const json = JSON.stringify(obj, (key, value) => {
    if (value instanceof Uint8Array) {
      return { __type: 'Uint8Array', data: Array.from(value) };
    }
    if (value instanceof Set) {
      return { __type: 'Set', data: Array.from(value) };
    }
    if (value instanceof Map) {
      return { __type: 'Map', data: Array.from(value.entries()) };
    }
    return value;
  });
  return new TextEncoder().encode(json);
}

function deserialize<T>(data: Uint8Array): T {
  const json = new TextDecoder().decode(data);
  return JSON.parse(json, (key, value) => {
    if (value && value.__type === 'Uint8Array') {
      return new Uint8Array(value.data);
    }
    if (value && value.__type === 'Set') {
      return new Set(value.data);
    }
    if (value && value.__type === 'Map') {
      return new Map(value.data);
    }
    return value;
  });
}

// Core data structures

interface PublicIdentity {
  signingPublicKey: SigningPublicKey;
  encryptionPublicKey: EncryptionPublicKey;
}

class PrivateIdentity {
  constructor(
    public signingPrivateKey: SigningPrivateKey,
    public encryptionPrivateKey: EncryptionPrivateKey,
    public signingPublicKey: SigningPublicKey,
    public encryptionPublicKey: EncryptionPublicKey,
  ) {}

  static generate(): PrivateIdentity {
    const [signingPrivateKey, signingPublicKey] = Signing.generateKeyPair();
    const [encryptionPrivateKey, encryptionPublicKey] = Encryption.generateKeyPair();
    return new PrivateIdentity(signingPrivateKey, encryptionPrivateKey, signingPublicKey, encryptionPublicKey);
  }

  getPublicIdentity(): PublicIdentity {
    return {
      signingPublicKey: this.signingPublicKey,
      encryptionPublicKey: this.encryptionPublicKey,
    };
  }
}

class Identifier {
  constructor(public value: Uint8Array) {}

  static generate(): Identifier {
    return new Identifier(crypto.getRandomValues(new Uint8Array(16)));
  }

  toString(): string {
    return Array.from(this.value)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

interface GroupInfo {
  rootFileIdentifier: Identifier;
  trustedSnapshotIndex: number;
  publicIdentity: PublicIdentity;
}

class RootFile {
  constructor(
    public content: string,
    public privateIdentity: PrivateIdentity,
    public members: Set<PublicIdentity>,
    public groups: Map<string, GroupInfo>,
  ) {}

  serialize(): Uint8Array {
    return serialize({
      content: this.content,
      privateIdentity: this.privateIdentity,
      members: this.members,
      groups: this.groups,
    });
  }

  static deserialize(data: Uint8Array): RootFile {
    const obj = deserialize<any>(data);
    return new RootFile(obj.content, obj.privateIdentity, obj.members, obj.groups);
  }
}

class SnapshotPayload {
  constructor(
    public encryptedKeys: Map<string, EncryptionCiphertext>, // Keyed by PublicIdentity hash
    public encryptedRootFile: Uint8Array,
  ) {}

  serialize(): Uint8Array {
    return serialize({
      encryptedKeys: this.encryptedKeys,
      encryptedRootFile: this.encryptedRootFile,
    });
  }
}

class Snapshot {
  constructor(
    public author: PublicIdentity,
    public payload: SnapshotPayload,
    public signature: Signature,
  ) {}
}

class History {
  constructor(public snapshots: Snapshot[]) {}
}

class Shared {
  constructor(
    public history: History,
    public invitations: Map<string, GroupInfo>,
  ) {}

  serialize(): Uint8Array {
    return serialize({
      history: this.history,
      invitations: this.invitations,
    });
  }

  static deserialize(data: Uint8Array): Shared {
    const obj = deserialize<any>(data);
    return new Shared(obj.history, obj.invitations);
  }
}

// Helper to hash PublicIdentity for use as Map keys
function hashPublicIdentity(identity: PublicIdentity): string {
  const combined = new Uint8Array(identity.signingPublicKey.length + identity.encryptionPublicKey.length);
  combined.set(identity.signingPublicKey, 0);
  combined.set(identity.encryptionPublicKey, identity.signingPublicKey.length);
  return Array.from(combined)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Server and operations

class Server {
  private files: Map<string, Uint8Array> = new Map();

  setFile(identifier: Identifier, content: Uint8Array): void {
    this.files.set(identifier.toString(), content);
  }

  getFile(identifier: Identifier): Uint8Array {
    const content = this.files.get(identifier.toString());
    if (!content) {
      throw new Error(`File not found: ${identifier.toString()}`);
    }
    return content;
  }
}

function createSnapshot(privateIdentity: PrivateIdentity, rootFile: RootFile, members: Set<PublicIdentity>): Snapshot {
  const rootFileEncryptionKey = AEAD.generateKey();
  const encryptedRootFile = AEAD.encrypt(rootFileEncryptionKey, rootFile.serialize());

  const encryptedKeys = new Map<string, EncryptionCiphertext>();
  for (const member of members) {
    const hash = hashPublicIdentity(member);
    encryptedKeys.set(hash, Encryption.encrypt(member.encryptionPublicKey, rootFileEncryptionKey));
  }

  const snapshotPayload = new SnapshotPayload(encryptedKeys, encryptedRootFile);

  return new Snapshot(
    privateIdentity.getPublicIdentity(),
    snapshotPayload,
    Signing.sign(privateIdentity.signingPrivateKey, snapshotPayload.serialize()),
  );
}

function decryptSnapshot(privateIdentity: PrivateIdentity, snapshot: Snapshot): RootFile {
  if (!Signing.verify(snapshot.author.signingPublicKey, snapshot.signature, snapshot.payload.serialize())) {
    throw new Error('Invalid signature');
  }

  const myHash = hashPublicIdentity(privateIdentity.getPublicIdentity());
  const encryptedKey = snapshot.payload.encryptedKeys.get(myHash);
  if (!encryptedKey) {
    throw new Error('Key not found for this identity');
  }

  const rootFileEncryptionKey = Encryption.decrypt(privateIdentity.encryptionPrivateKey, encryptedKey) as AEADKey;

  return RootFile.deserialize(AEAD.decrypt(rootFileEncryptionKey, snapshot.payload.encryptedRootFile));
}

function decryptHistory(privateIdentity: PrivateIdentity, history: History, trustedSnapshotIndex: number): RootFile {
  let rootFile = decryptSnapshot(privateIdentity, history.snapshots[trustedSnapshotIndex]);
  let members = rootFile.members;

  for (let i = trustedSnapshotIndex + 1; i < history.snapshots.length; i++) {
    const snapshot = history.snapshots[i];

    // Verify author is a member
    const authorHash = hashPublicIdentity(snapshot.author);
    let isAuthorMember = false;
    for (const member of members) {
      if (hashPublicIdentity(member) === authorHash) {
        isAuthorMember = true;
        break;
      }
    }

    if (!isAuthorMember) {
      throw new Error('Invalid author');
    }

    rootFile = decryptSnapshot(privateIdentity, snapshot);
    members = rootFile.members;
  }

  return rootFile;
}

function createGroup(
  privateIdentity: PrivateIdentity,
  content: string,
  members: Set<PublicIdentity>,
): [Shared, PrivateIdentity] {
  const groupPrivateIdentity = PrivateIdentity.generate();
  const rootFile = new RootFile(content, groupPrivateIdentity, members, new Map());
  const shared = new Shared(new History([createSnapshot(privateIdentity, rootFile, members)]), new Map());
  return [shared, groupPrivateIdentity];
}

function modifyContent(
  privateIdentity: PrivateIdentity,
  shared: Shared,
  content: string,
  trustedSnapshotIndex: number,
): void {
  const rootFile = decryptHistory(privateIdentity, shared.history, trustedSnapshotIndex);
  rootFile.content = content;
  shared.history.snapshots.push(createSnapshot(privateIdentity, rootFile, rootFile.members));
}

function addMember(
  privateIdentity: PrivateIdentity,
  shared: Shared,
  member: PublicIdentity,
  trustedSnapshotIndex: number,
): PrivateIdentity {
  const rootFile = decryptHistory(privateIdentity, shared.history, trustedSnapshotIndex);
  const members = new Set([...rootFile.members, member]);
  rootFile.privateIdentity = PrivateIdentity.generate();
  shared.history.snapshots.push(createSnapshot(privateIdentity, rootFile, members));
  return rootFile.privateIdentity;
}

interface GroupPrivateInfo {
  publicInfo: GroupInfo;
  ownerPrivateIdentity: PrivateIdentity;
}

class Client {
  private groups: Map<string, GroupPrivateInfo> = new Map();

  constructor(private server: Server) {
    this.groups.set('base', this.createBaseGroup());
  }

  private createBaseGroup(): GroupPrivateInfo {
    const privateIdentity = PrivateIdentity.generate();
    const [shared, groupPrivateIdentity] = createGroup(
      privateIdentity,
      '',
      new Set([privateIdentity.getPublicIdentity()]),
    );
    const rootFileIdentifier = Identifier.generate();
    this.server.setFile(rootFileIdentifier, shared.serialize());
    return {
      publicInfo: {
        rootFileIdentifier,
        trustedSnapshotIndex: 0,
        publicIdentity: groupPrivateIdentity.getPublicIdentity(),
      },
      ownerPrivateIdentity: privateIdentity,
    };
  }

  addToGroup(localGroupName: string, groupInfo: GroupInfo): void {
    const baseGroup = this.groups.get('base')!;
    this.groups.set(localGroupName, {
      publicInfo: groupInfo,
      ownerPrivateIdentity: baseGroup.ownerPrivateIdentity,
    });
  }

  discover(): void {
    const discoverInner = (groupPrivateInfo: GroupPrivateInfo): Map<string, GroupPrivateInfo> => {
      const shared = Shared.deserialize(this.server.getFile(groupPrivateInfo.publicInfo.rootFileIdentifier));
      const rootFile = decryptHistory(
        groupPrivateInfo.ownerPrivateIdentity,
        shared.history,
        groupPrivateInfo.publicInfo.trustedSnapshotIndex,
      );

      if (shared.invitations.size > 0) {
        for (const [localGroupName, invitation] of shared.invitations) {
          rootFile.groups.set(localGroupName, invitation);
        }
        shared.invitations.clear();
        shared.history.snapshots.push(
          createSnapshot(groupPrivateInfo.ownerPrivateIdentity, rootFile, rootFile.members),
        );
        this.server.setFile(groupPrivateInfo.publicInfo.rootFileIdentifier, shared.serialize());
      }

      const result = new Map<string, GroupPrivateInfo>();
      for (const [localGroupName, groupPublicInfo] of rootFile.groups) {
        result.set(localGroupName, {
          publicInfo: groupPublicInfo,
          ownerPrivateIdentity: rootFile.privateIdentity,
        });
      }
      return result;
    };

    let groups = new Map(this.groups);
    const newGroups = new Map(this.groups);

    while (groups.size > 0) {
      const [name, groupPrivateInfo] = groups.entries().next().value;
      groups.delete(name);

      const discovered = discoverInner(groupPrivateInfo);
      for (const [k, v] of discovered) {
        newGroups.set(k, v);
        groups.set(k, v);
      }
    }

    this.groups = newGroups;
  }

  createGroupFromGroup(privateGroupInfo: GroupPrivateInfo, localGroupName: string, groupInfos: Set<GroupInfo>): void {
    const ownerGroupFile = decryptHistory(
      privateGroupInfo.ownerPrivateIdentity,
      Shared.deserialize(this.server.getFile(privateGroupInfo.publicInfo.rootFileIdentifier)).history,
      privateGroupInfo.publicInfo.trustedSnapshotIndex,
    );

    // ISSUE FIXED: groupInfos contains GroupInfo objects, not members with .public_identity
    const members = new Set<PublicIdentity>();
    for (const groupInfo of groupInfos) {
      members.add(groupInfo.publicIdentity);
    }

    const [shared, groupPrivateIdentity] = createGroup(ownerGroupFile.privateIdentity, 'Hello world!', members);

    const rootFileIdentifier = Identifier.generate();
    const metagroupInfo: GroupInfo = {
      rootFileIdentifier,
      trustedSnapshotIndex: 0,
      publicIdentity: groupPrivateIdentity.getPublicIdentity(),
    };

    this.server.setFile(rootFileIdentifier, shared.serialize());

    for (const groupInfo of groupInfos) {
      const sharedTarget = Shared.deserialize(this.server.getFile(groupInfo.rootFileIdentifier));
      sharedTarget.invitations.set(localGroupName, metagroupInfo);
      this.server.setFile(groupInfo.rootFileIdentifier, sharedTarget.serialize());
    }

    this.groups.set(localGroupName, {
      publicInfo: metagroupInfo,
      ownerPrivateIdentity: ownerGroupFile.privateIdentity,
    });
  }

  addMemberToGroup(localGroupName: string, member: PublicIdentity): GroupInfo {
    const groupPrivateInfo = this.groups.get(localGroupName)!;
    const shared = Shared.deserialize(this.server.getFile(groupPrivateInfo.publicInfo.rootFileIdentifier));

    const groupPrivateIdentity = addMember(
      groupPrivateInfo.ownerPrivateIdentity,
      shared,
      member,
      groupPrivateInfo.publicInfo.trustedSnapshotIndex,
    );

    const groupInfo: GroupInfo = {
      rootFileIdentifier: groupPrivateInfo.publicInfo.rootFileIdentifier,
      trustedSnapshotIndex: shared.history.snapshots.length - 1,
      publicIdentity: groupPrivateIdentity.getPublicIdentity(),
    };

    this.server.setFile(groupInfo.rootFileIdentifier, shared.serialize());

    this.groups.set(localGroupName, {
      publicInfo: groupInfo,
      ownerPrivateIdentity: groupPrivateInfo.ownerPrivateIdentity,
    });

    return groupInfo;
  }

  getContent(localGroupName: string): string {
    const groupInfo = this.groups.get(localGroupName)!;
    const rootFile = decryptHistory(
      groupInfo.ownerPrivateIdentity,
      Shared.deserialize(this.server.getFile(groupInfo.publicInfo.rootFileIdentifier)).history,
      groupInfo.publicInfo.trustedSnapshotIndex,
    );
    return rootFile.content;
  }
}

// Test execution
const server = new Server();

// Create device A
const deviceA = new Client(server);

// Create team 1 consisting of device A
deviceA.createGroupFromGroup(
  deviceA['groups'].get('base')!,
  'team 1',
  new Set([deviceA['groups'].get('base')!.publicInfo]),
);

deviceA.discover();

console.assert(deviceA.getContent('team 1') === 'Hello world!', 'Device A team 1 content check 1');

// Create device B
const deviceB = new Client(server);

// Add device B to team 1
const team1Info = deviceA.addMemberToGroup(
  'team 1',
  deviceB['groups'].get('base')!.ownerPrivateIdentity.getPublicIdentity(),
);

// Accept invitation
deviceB.addToGroup('team 1', team1Info);

console.assert(deviceA.getContent('team 1') === 'Hello world!', 'Device A team 1 content check 2');
console.assert(deviceB.getContent('team 1') === 'Hello world!', 'Device B team 1 content check');

// Create device C
const deviceC = new Client(server);

// Create team 2 consisting of device C
deviceC.createGroupFromGroup(
  deviceC['groups'].get('base')!,
  'team 2',
  new Set([deviceC['groups'].get('base')!.publicInfo]),
);

console.assert(deviceC.getContent('team 2') === 'Hello world!', 'Device C team 2 content check');

// Create company group
deviceA.createGroupFromGroup(
  deviceA['groups'].get('team 1')!,
  'company',
  new Set([deviceA['groups'].get('team 1')!.publicInfo, deviceC['groups'].get('team 2')!.publicInfo]),
);

deviceA.discover();
deviceC.discover();

console.assert(deviceA.getContent('company') === 'Hello world!', 'Device A company content check');
console.assert(deviceC.getContent('company') === 'Hello world!', 'Device C company content check');

console.log('All tests passed! ✓');
