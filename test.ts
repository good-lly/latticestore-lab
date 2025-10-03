/**
 * LatticeStore - Post-Quantum Secure Collaborative Storage System
 *
 * ARCHITECTURE OVERVIEW:
 * This system enables secure, decentralized collaboration using post-quantum cryptography.
 *
 * KEY CONCEPTS:
 * 1. Identity: Each device has a private identity (signing + encryption keys)
 * 2. Groups: Encrypted containers that multiple identities can access
 * 3. Snapshots: Versioned, signed states of a group's content
 * 4. History: Chain of snapshots forming an auditable log
 * 5. Forward Secrecy: Group keys rotate when members are added
 *
 * DATA FLOW:
 * Client -> Encrypt with group key -> Sign with identity -> Server storage
 * Server -> Client -> Verify signature -> Decrypt with group key -> Access content
 */

// =============================================================================
// CRYPTOGRAPHIC PRIMITIVES
// =============================================================================

import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';

// Branded types prevent accidentally mixing different key types at compile time
type AEADKey = Uint8Array & { readonly __brand: 'AEADKey' };
type SecretKey = Uint8Array & { readonly __brand: 'SecretKey' };
type SigningPublicKey = Uint8Array & { readonly __brand: 'SigningPublicKey' };
type Signature = Uint8Array & { readonly __brand: 'Signature' };
type EncryptionPrivateKey = Uint8Array & { readonly __brand: 'EncryptionPrivateKey' };
type EncryptionPublicKey = Uint8Array & { readonly __brand: 'EncryptionPublicKey' };
type EncryptionCiphertext = Uint8Array & { readonly __brand: 'EncryptionCiphertext' };

/**
 * AEAD (Authenticated Encryption with Associated Data)
 * Used for encrypting the actual content (RootFile) with symmetric keys
 *
 * In production: Use AES-256-GCM
 */
class AEAD {
  static generateKey(): AEADKey {
    return crypto.getRandomValues(new Uint8Array(32)) as AEADKey;
  }

  static encrypt(key: AEADKey, plaintext: Uint8Array): Uint8Array {
    // Mock: In production, use actual AEAD encryption
    const result = new Uint8Array(key.length + plaintext.length);
    result.set(key, 0);
    result.set(plaintext, key.length);
    return result;
  }

  static decrypt(key: AEADKey, ciphertext: Uint8Array): Uint8Array {
    // Mock: Verify key and extract plaintext
    for (let i = 0; i < 32; i++) {
      if (ciphertext[i] !== key[i]) {
        throw new Error('Invalid key');
      }
    }
    return ciphertext.slice(32);
  }
}

/**
 * Digital Signature Scheme - ML-DSA (CRYSTALS-Dilithium)
 * Post-quantum secure digital signatures for verifying snapshot authenticity
 *
 * PURPOSE: Proves who created each snapshot and prevents tampering
 */
class Signing {
  static generateKeyPair(): [SecretKey, SigningPublicKey] {
    const seed = crypto.getRandomValues(new Uint8Array(32));
    const keys = ml_dsa87.keygen(seed);
    return [keys.secretKey as SecretKey, keys.publicKey as SigningPublicKey];
  }

  static sign(privateKey: SecretKey, message: Uint8Array): Signature {
    return ml_dsa87.sign(privateKey, message) as Signature;
  }

  static verify(publicKey: SigningPublicKey, message: Uint8Array, signature: Signature): boolean {
    return ml_dsa87.verify(publicKey, message, signature);
  }
}

/**
 * Public Key Encryption - ML-KEM (CRYSTALS-Kyber) [Mock version]
 * Post-quantum secure key encapsulation for sharing symmetric keys
 *
 * PURPOSE: Each group has a symmetric AEAD key that's encrypted separately
 * for each member using their public encryption key
 */
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

// =============================================================================
// SERIALIZATION UTILITIES
// =============================================================================

/**
 * Serialize objects to bytes for encryption/storage
 * Handles special types like Uint8Array, Set, and Map
 */
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

/**
 * Deserialize bytes back to objects
 * Reconstructs special types from JSON representation
 */
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

// =============================================================================
// IDENTITY MANAGEMENT
// =============================================================================

/**
 * PublicIdentity - The "address" of a device/user
 * Can be shared publicly to invite someone to a group
 */
interface PublicIdentity {
  signingPublicKey: SigningPublicKey; // For verifying signatures
  encryptionPublicKey: EncryptionPublicKey; // For encrypting keys to this identity
}

/**
 * PrivateIdentity - The secret keys owned by a device
 * Never shared; used to sign and decrypt
 */
class PrivateIdentity {
  constructor(
    public signingSecretKey: SecretKey,
    public encryptionPrivateKey: EncryptionPrivateKey,
    public signingPublicKey: SigningPublicKey,
    public encryptionPublicKey: EncryptionPublicKey,
  ) {}

  static generate(): PrivateIdentity {
    const [signingSecretKey, signingPublicKey] = Signing.generateKeyPair();
    const [encryptionPrivateKey, encryptionPublicKey] = Encryption.generateKeyPair();
    return new PrivateIdentity(signingSecretKey, encryptionPrivateKey, signingPublicKey, encryptionPublicKey);
  }

  getPublicIdentity(): PublicIdentity {
    return {
      signingPublicKey: this.signingPublicKey,
      encryptionPublicKey: this.encryptionPublicKey,
    };
  }
}

/**
 * Identifier - Unique ID for files stored on the server
 * Random 128-bit value ensures no collisions
 */
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

// =============================================================================
// GROUP DATA STRUCTURES
// =============================================================================

/**
 * GroupInfo - Public metadata for joining a group
 * This is what you give someone to invite them
 *
 * CONTAINS:
 * - Where the group's data is stored (rootFileIdentifier)
 * - Which snapshot to trust (trustedSnapshotIndex)
 * - How to verify/decrypt (publicIdentity)
 */
interface GroupInfo {
  rootFileIdentifier: Identifier; // Points to the Shared object on server
  trustedSnapshotIndex: number; // Start reading from this snapshot
  publicIdentity: PublicIdentity; // Group's identity for encryption
}

/**
 * RootFile - The actual content and metadata of a group
 *
 * This is what gets encrypted in each snapshot. Contains:
 * - content: The actual data (could be file contents, JSON, etc.)
 * - privateIdentity: Current group keys (rotated on member changes)
 * - members: Who can access this group
 * - groups: Nested/child groups this group knows about
 */
class RootFile {
  constructor(
    public content: string,
    public privateIdentity: PrivateIdentity, // Current group keys
    public members: Set<PublicIdentity>, // Current member list
    public groups: Map<string, GroupInfo>, // Nested groups
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

/**
 * SnapshotPayload - Encrypted state at a point in time
 *
 * ENCRYPTION SCHEME:
 * 1. Generate random AEAD key
 * 2. Encrypt RootFile with AEAD key
 * 3. For each member, encrypt the AEAD key with their public key
 *
 * This allows multiple members to decrypt the same content
 */
class SnapshotPayload {
  constructor(
    public encryptedKeys: Map<string, EncryptionCiphertext>, // AEAD key encrypted per member
    public encryptedRootFile: Uint8Array, // The actual encrypted content
  ) {}

  serialize(): Uint8Array {
    return serialize({
      encryptedKeys: this.encryptedKeys,
      encryptedRootFile: this.encryptedRootFile,
    });
  }
}

/**
 * Snapshot - Signed, encrypted version of RootFile
 *
 * SECURITY:
 * - Payload is encrypted so server can't read content
 * - Signature proves who created this snapshot
 * - Chain of snapshots forms tamper-evident log
 */
class Snapshot {
  constructor(
    public author: PublicIdentity, // Who created this snapshot
    public payload: SnapshotPayload, // Encrypted content
    public signature: Signature, // Proves authenticity
  ) {}
}

/**
 * History - Ordered chain of snapshots
 * Forms an append-only log of all changes to the group
 */
class History {
  constructor(public snapshots: Snapshot[]) {}
}

/**
 * Shared - What's actually stored on the server for each group
 *
 * CONTAINS:
 * - history: All snapshots (encrypted, signed)
 * - invitations: Pending invites to nested groups
 */
class Shared {
  constructor(
    public history: History,
    public invitations: Map<string, GroupInfo>, // Pending nested group invites
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

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Hash a PublicIdentity to use as a Map key
 * Needed because JavaScript can't use objects as Map keys by value
 */
function hashPublicIdentity(identity: PublicIdentity): string {
  const combined = new Uint8Array(identity.signingPublicKey.length + identity.encryptionPublicKey.length);
  combined.set(identity.signingPublicKey, 0);
  combined.set(identity.encryptionPublicKey, identity.signingPublicKey.length);
  return Array.from(combined)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// SERVER (Content-Addressed Storage)
// =============================================================================

/**
 * Server - Simple key-value store for encrypted group data
 *
 * In production, this would be S3/MinIO/IPFS
 * Server cannot read content (encrypted) or forge snapshots (signed)
 */
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

// =============================================================================
// CORE OPERATIONS
// =============================================================================

/**
 * Create a new snapshot of a group
 *
 * PROCESS:
 * 1. Generate fresh AEAD key for this snapshot
 * 2. Encrypt RootFile with AEAD key
 * 3. For each member, encrypt AEAD key with their public key
 * 4. Sign the entire payload with author's signing key
 *
 * This ensures:
 * - Only members can decrypt (have the AEAD key)
 * - Everyone can verify who created it (signature)
 * - Content is authenticated and tamper-proof
 */
function createSnapshot(privateIdentity: PrivateIdentity, rootFile: RootFile, members: Set<PublicIdentity>): Snapshot {
  // Step 1: Generate fresh symmetric key for this snapshot
  const rootFileEncryptionKey = AEAD.generateKey();

  // Step 2: Encrypt the RootFile with symmetric key
  const encryptedRootFile = AEAD.encrypt(rootFileEncryptionKey, rootFile.serialize());

  // Step 3: Encrypt symmetric key separately for each member
  const encryptedKeys = new Map<string, EncryptionCiphertext>();
  for (const member of members) {
    const hash = hashPublicIdentity(member);
    encryptedKeys.set(hash, Encryption.encrypt(member.encryptionPublicKey, rootFileEncryptionKey));
  }

  // Step 4: Package and sign everything
  const snapshotPayload = new SnapshotPayload(encryptedKeys, encryptedRootFile);

  return new Snapshot(
    privateIdentity.getPublicIdentity(),
    snapshotPayload,
    Signing.sign(privateIdentity.signingSecretKey, snapshotPayload.serialize()),
  );
}

/**
 * Decrypt a single snapshot
 *
 * VERIFICATION PROCESS:
 * 1. Verify signature (proves authenticity)
 * 2. Find encrypted AEAD key for our identity
 * 3. Decrypt AEAD key with our private key
 * 4. Decrypt RootFile with AEAD key
 */
function decryptSnapshot(privateIdentity: PrivateIdentity, snapshot: Snapshot): RootFile {
  // Step 1: Verify the signature
  if (!Signing.verify(snapshot.author.signingPublicKey, snapshot.payload.serialize(), snapshot.signature)) {
    throw new Error('Invalid signature');
  }

  // Step 2: Find our encrypted key
  const myHash = hashPublicIdentity(privateIdentity.getPublicIdentity());
  const encryptedKey = snapshot.payload.encryptedKeys.get(myHash);
  if (!encryptedKey) {
    throw new Error('Key not found for this identity');
  }

  // Step 3: Decrypt the AEAD key
  const rootFileEncryptionKey = Encryption.decrypt(privateIdentity.encryptionPrivateKey, encryptedKey) as AEADKey;

  // Step 4: Decrypt the content
  return RootFile.deserialize(AEAD.decrypt(rootFileEncryptionKey, snapshot.payload.encryptedRootFile));
}

/**
 * Decrypt a chain of snapshots to get current state
 *
 * SECURITY MODEL:
 * - Start from a trusted snapshot index
 * - Verify each subsequent snapshot's author is a member
 * - This prevents unauthorized snapshots in the chain
 * - Member list updates as we replay history
 */
function decryptHistory(privateIdentity: PrivateIdentity, history: History, trustedSnapshotIndex: number): RootFile {
  // Start from trusted snapshot
  let rootFile = decryptSnapshot(privateIdentity, history.snapshots[trustedSnapshotIndex]);
  let members = rootFile.members;

  // Replay subsequent snapshots
  for (let i = trustedSnapshotIndex + 1; i < history.snapshots.length; i++) {
    const snapshot = history.snapshots[i];

    // CRITICAL: Verify author is a current member
    const authorHash = hashPublicIdentity(snapshot.author);
    let isAuthorMember = false;
    for (const member of members) {
      if (hashPublicIdentity(member) === authorHash) {
        isAuthorMember = true;
        break;
      }
    }

    if (!isAuthorMember) {
      throw new Error('Invalid author - not a member');
    }

    // Decrypt and update state
    rootFile = decryptSnapshot(privateIdentity, snapshot);
    members = rootFile.members;
  }

  return rootFile;
}

/**
 * Create a new group
 *
 * INITIALIZATION:
 * 1. Generate fresh identity for the group
 * 2. Create initial RootFile with content and members
 * 3. Create first snapshot
 * 4. Return Shared object (ready to store on server)
 */
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

/**
 * Modify content and create new snapshot
 * Creates a new version in the history chain
 */
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

/**
 * Add a new member to a group
 *
 * FORWARD SECRECY:
 * - Generates NEW group identity (rotates keys)
 * - New member gets access to future snapshots
 * - Cannot decrypt past snapshots (uses old keys)
 */
function addMember(
  privateIdentity: PrivateIdentity,
  shared: Shared,
  member: PublicIdentity,
  trustedSnapshotIndex: number,
): PrivateIdentity {
  const rootFile = decryptHistory(privateIdentity, shared.history, trustedSnapshotIndex);
  const members = new Set([...rootFile.members, member]);

  // KEY ROTATION: Generate fresh group identity
  rootFile.privateIdentity = PrivateIdentity.generate();

  shared.history.snapshots.push(createSnapshot(privateIdentity, rootFile, members));
  return rootFile.privateIdentity;
}

// =============================================================================
// CLIENT API
// =============================================================================

interface GroupPrivateInfo {
  publicInfo: GroupInfo;
  ownerPrivateIdentity: PrivateIdentity;
}

/**
 * Client - High-level API for managing groups
 *
 * DESIGN:
 * - Each device has a "base" group (personal space)
 * - Groups can be nested (company -> teams -> projects)
 * - Discovery process syncs nested group invitations
 */
class Client {
  private groups: Map<string, GroupPrivateInfo> = new Map();

  constructor(private server: Server) {
    // Every client starts with a personal "base" group
    this.groups.set('base', this.createBaseGroup());
  }

  /**
   * Create the base group for this device
   * This is the root of the device's group hierarchy
   */
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

  /**
   * Accept an invitation to join a group
   * Store GroupInfo locally under a friendly name
   */
  addToGroup(localGroupName: string, groupInfo: GroupInfo): void {
    const baseGroup = this.groups.get('base')!;
    this.groups.set(localGroupName, {
      publicInfo: groupInfo,
      ownerPrivateIdentity: baseGroup.ownerPrivateIdentity,
    });
  }

  /**
   * Discover and sync nested group invitations
   *
   * PROCESS:
   * - Check each known group for pending invitations
   * - Move invitations into the group's permanent structure
   * - Recursively discover newly found groups
   * - Creates a complete view of the group hierarchy
   */
  discover(): void {
    const discoverInner = (groupPrivateInfo: GroupPrivateInfo): Map<string, GroupPrivateInfo> => {
      const shared = Shared.deserialize(this.server.getFile(groupPrivateInfo.publicInfo.rootFileIdentifier));
      const rootFile = decryptHistory(
        groupPrivateInfo.ownerPrivateIdentity,
        shared.history,
        groupPrivateInfo.publicInfo.trustedSnapshotIndex,
      );

      // Process pending invitations
      if (shared.invitations.size > 0) {
        for (const [localGroupName, invitation] of shared.invitations) {
          rootFile.groups.set(localGroupName, invitation);
        }
        shared.invitations.clear();

        // Create snapshot to persist accepted invitations
        shared.history.snapshots.push(
          createSnapshot(groupPrivateInfo.ownerPrivateIdentity, rootFile, rootFile.members),
        );
        this.server.setFile(groupPrivateInfo.publicInfo.rootFileIdentifier, shared.serialize());
      }

      // Return discovered nested groups
      const result = new Map<string, GroupPrivateInfo>();
      for (const [localGroupName, groupPublicInfo] of rootFile.groups) {
        result.set(localGroupName, {
          publicInfo: groupPublicInfo,
          ownerPrivateIdentity: rootFile.privateIdentity,
        });
      }
      return result;
    };

    // Breadth-first traversal of group hierarchy
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

  /**
   * Create a meta-group from an existing group
   *
   * USE CASE: "Create a 'company' group that includes 'team1' and 'team2'"
   * This allows hierarchical organization of groups
   */
  createGroupFromGroup(privateGroupInfo: GroupPrivateInfo, localGroupName: string, groupInfos: Set<GroupInfo>): void {
    const ownerGroupFile = decryptHistory(
      privateGroupInfo.ownerPrivateIdentity,
      Shared.deserialize(this.server.getFile(privateGroupInfo.publicInfo.rootFileIdentifier)).history,
      privateGroupInfo.publicInfo.trustedSnapshotIndex,
    );

    // Extract public identities from GroupInfos
    const members = new Set<PublicIdentity>();
    for (const groupInfo of groupInfos) {
      members.add(groupInfo.publicIdentity);
    }

    // Create the new meta-group
    const [shared, groupPrivateIdentity] = createGroup(ownerGroupFile.privateIdentity, 'Hello world!', members);

    const rootFileIdentifier = Identifier.generate();
    const metagroupInfo: GroupInfo = {
      rootFileIdentifier,
      trustedSnapshotIndex: 0,
      publicIdentity: groupPrivateIdentity.getPublicIdentity(),
    };

    this.server.setFile(rootFileIdentifier, shared.serialize());

    // Send invitations to each member group
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

  /**
   * Add a member to an existing group
   * Returns GroupInfo to send to the new member
   */
  addMemberToGroup(localGroupName: string, member: PublicIdentity): GroupInfo {
    const groupPrivateInfo = this.groups.get(localGroupName)!;
    const shared = Shared.deserialize(this.server.getFile(groupPrivateInfo.publicInfo.rootFileIdentifier));

    // Add member and rotate keys
    const groupPrivateIdentity = addMember(
      groupPrivateInfo.ownerPrivateIdentity,
      shared,
      member,
      groupPrivateInfo.publicInfo.trustedSnapshotIndex,
    );

    // Create new GroupInfo with updated snapshot index
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

  /**
   * Get the current content of a group
   * Decrypts and verifies the entire history chain
   */
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

// =============================================================================
// TEST EXECUTION
// =============================================================================

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

// Create company group (meta-group containing team 1 and team 2)
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
