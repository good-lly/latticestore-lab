import pickle
from dataclasses import dataclass
from random import randbytes
from typing import NewType


# Mock
class AEAD:  # For example AES_GCM
    Key = NewType("Key", bytes)

    @classmethod
    def generate_key(cls) -> Key:
        return AEAD.Key(randbytes(16))

    @classmethod
    def encrypt(cls, key: Key, plaintext: bytes) -> bytes:
        return key + plaintext

    @classmethod
    def decrypt(cls, key: Key, ciphertext: bytes) -> bytes:
        if ciphertext[:16] != key:
            raise ValueError("Invalid key")
        return ciphertext[16:]


# Mock
class Signing:  # For example ML-DSA
    Signature = NewType("Signature", bytes)
    PrivateKey = NewType("PrivateKey", bytes)
    PublicKey = NewType("PublicKey", bytes)

    @classmethod
    def generate_key_pair(cls) -> tuple[PrivateKey, PublicKey]:
        private_key = randbytes(4)
        return Signing.PrivateKey(private_key), Signing.PublicKey(private_key)

    @classmethod
    def sign(cls, private_key: PrivateKey, message: bytes) -> Signature:
        return Signing.Signature(private_key + message)

    @classmethod
    def verify(cls, public_key: PublicKey, signature: Signature, message: bytes) -> bool:
        return public_key + message == signature


# Mock
class Encryption:  # For example ML-KEM
    Ciphertext = NewType("Ciphertext", bytes)
    PrivateKey = NewType("PrivateKey", bytes)
    PublicKey = NewType("PublicKey", bytes)

    @classmethod
    def generate_key_pair(cls) -> tuple[PrivateKey, PublicKey]:
        private_key = randbytes(4)
        return Encryption.PrivateKey(private_key), Encryption.PublicKey(private_key)

    @classmethod
    def encrypt(cls, public_key: PublicKey, plaintext: bytes) -> Ciphertext:
        return Encryption.Ciphertext(public_key + plaintext)

    @classmethod
    def decrypt(cls, private_key: PrivateKey, ciphertext: Ciphertext) -> bytes:
        if ciphertext[:4] != private_key:
            raise ValueError("Invalid key")
        return ciphertext[4:]


@dataclass(frozen=True)
class PublicIdentity:
    signing_public_key: Signing.PublicKey
    encryption_public_key: Encryption.PublicKey


@dataclass(frozen=True)
class PrivateIdentity:
    signing_private_key: Signing.PrivateKey
    encryption_private_key: Encryption.PrivateKey
    signing_public_key: Signing.PublicKey
    encryption_public_key: Encryption.PublicKey

    @classmethod
    def generate(cls) -> "PrivateIdentity":
        signing_private_key, signing_public_key = Signing.generate_key_pair()
        encryption_private_key, encryption_public_key = Encryption.generate_key_pair()
        return PrivateIdentity(signing_private_key, encryption_private_key, signing_public_key, encryption_public_key)

    def get_public_identity(self) -> PublicIdentity:
        return PublicIdentity(self.signing_public_key, self.encryption_public_key)


@dataclass(frozen=True)
class Identifier:
    value: bytes

    @classmethod
    def generate(cls) -> "Identifier":
        return Identifier(randbytes(16))


@dataclass(frozen=True)
class GroupInfo:
    root_file_identifier: Identifier
    trusted_snapshot_index: int
    public_identity: PublicIdentity


@dataclass
class RootFile:
    content: str
    private_identity: PrivateIdentity
    members: set[PublicIdentity]
    groups: dict[str, GroupInfo]

    def serialize(self) -> bytes:
        return pickle.dumps(self)

    @classmethod
    def deserialize(cls, data: bytes) -> "RootFile":
        return pickle.loads(data)


@dataclass
class SnapshotPayload:
    encrypted_keys: dict[PublicIdentity, Encryption.Ciphertext]
    encrypted_root_file: bytes

    def serialize(self) -> bytes:
        return pickle.dumps(self)


@dataclass
class Snapshot:
    author: PublicIdentity  # TODO: This can be removed
    payload: SnapshotPayload
    signature: Signing.Signature


@dataclass
class History:
    snapshots: list[Snapshot]


@dataclass
class Shared:
    history: History
    invitations: dict[str, GroupInfo]  # TODO: This will be signed

    def serialize(self) -> bytes:
        return pickle.dumps(self)

    @classmethod
    def deserialize(cls, data: bytes) -> "Shared":
        return pickle.loads(data)


class Server:
    def __init__(self) -> None:
        self.files: dict[Identifier, bytes] = {}

    def set_file(self, identifier: Identifier, content: bytes) -> None:
        self.files[identifier] = content

    def get_file(self, identifier: Identifier) -> bytes:
        return self.files[identifier]


def create_snapshot(private_identity: PrivateIdentity, root_file: RootFile, members: set[PublicIdentity]) -> Snapshot:
    root_file_encryption_key = AEAD.generate_key()
    encrypted_root_file = AEAD.encrypt(root_file_encryption_key, root_file.serialize())
    encrypted_keys = {
        member: Encryption.encrypt(member.encryption_public_key, root_file_encryption_key) for member in members
    }
    snapshot_payload = SnapshotPayload(encrypted_keys, encrypted_root_file)
    return Snapshot(
        private_identity.get_public_identity(),
        snapshot_payload,
        Signing.sign(private_identity.signing_private_key, snapshot_payload.serialize()),
    )


def decrypt_snapshot(private_identity: PrivateIdentity, snapshot: Snapshot) -> RootFile:
    if not Signing.verify(snapshot.author.signing_public_key, snapshot.signature, snapshot.payload.serialize()):
        raise ValueError("Invalid signature")
    root_file_encryption_key = AEAD.Key(
        Encryption.decrypt(
            private_identity.encryption_private_key,
            snapshot.payload.encrypted_keys[private_identity.get_public_identity()],
        )
    )
    return RootFile.deserialize(AEAD.decrypt(root_file_encryption_key, snapshot.payload.encrypted_root_file))


def decrypt_history(private_identity: PrivateIdentity, history: History, trusted_snapshot_index: int) -> RootFile:
    root_file = decrypt_snapshot(private_identity, history.snapshots[trusted_snapshot_index])
    members = root_file.members
    for snapshot in history.snapshots[trusted_snapshot_index + 1 :]:
        if snapshot.author not in members:
            raise ValueError("Invalid author")
        root_file = decrypt_snapshot(private_identity, snapshot)
        members = root_file.members
    return root_file


def create_group(
    private_identity: PrivateIdentity, content: str, members: set[PublicIdentity]
) -> tuple[Shared, PrivateIdentity]:
    group_private_identity = PrivateIdentity.generate()
    root_file = RootFile(content, group_private_identity, members, {})
    shared = Shared(History([create_snapshot(private_identity, root_file, members)]), {})
    return shared, group_private_identity


def modify_content(
    private_identity: PrivateIdentity, shared: Shared, content: str, trusted_snapshot_index: int
) -> None:
    root_file = decrypt_history(private_identity, shared.history, trusted_snapshot_index)
    root_file.content = content
    shared.history.snapshots.append(create_snapshot(private_identity, root_file, root_file.members))


def add_member(
    private_identity: PrivateIdentity, shared: Shared, member: PublicIdentity, trusted_snapshot_index: int
) -> PrivateIdentity:
    root_file = decrypt_history(private_identity, shared.history, trusted_snapshot_index)
    members = root_file.members | {member}
    root_file.private_identity = PrivateIdentity.generate()
    shared.history.snapshots.append(create_snapshot(private_identity, root_file, members))
    return root_file.private_identity


@dataclass
class GroupPrivateInfo:
    public_info: GroupInfo
    owner_private_identity: PrivateIdentity


class Client:
    def __init__(self, server: Server) -> None:
        self.server = server
        self.groups: dict[str, GroupPrivateInfo] = {}
        self.groups["base"] = self.create_base_group()

    def create_base_group(self) -> GroupPrivateInfo:
        private_identity = PrivateIdentity.generate()
        shared, group_private_identity = create_group(
            private_identity,
            "",
            {private_identity.get_public_identity()},
        )
        root_file_identifier = Identifier.generate()
        self.server.set_file(root_file_identifier, shared.serialize())
        return GroupPrivateInfo(
            GroupInfo(root_file_identifier, 0, group_private_identity.get_public_identity()), private_identity
        )

    def add_to_group(self, local_group_name: str, group_info: GroupInfo) -> None:
        self.groups[local_group_name] = GroupPrivateInfo(group_info, self.groups["base"].owner_private_identity)

    def discover(self) -> None:
        def discover_inner(group_private_info: GroupPrivateInfo) -> dict[str, GroupPrivateInfo]:
            shared = Shared.deserialize(self.server.get_file(group_private_info.public_info.root_file_identifier))
            root_file = decrypt_history(
                group_private_info.owner_private_identity,
                shared.history,
                group_private_info.public_info.trusted_snapshot_index,
            )

            if len(shared.invitations):
                for local_group_name, invitation in shared.invitations.items():
                    root_file.groups[local_group_name] = invitation
                shared.invitations = {}
                shared.history.snapshots.append(
                    create_snapshot(group_private_info.owner_private_identity, root_file, root_file.members)
                )
                self.server.set_file(group_private_info.public_info.root_file_identifier, shared.serialize())

            return {
                local_group_name: GroupPrivateInfo(group_public_info, root_file.private_identity)
                for local_group_name, group_public_info in root_file.groups.items()
            }

        groups = self.groups
        new_groups: dict[str, GroupPrivateInfo] = self.groups.copy()
        while groups:
            _, group_private_info = groups.popitem()
            g = discover_inner(group_private_info)
            new_groups = new_groups | g
            groups = groups | g
        self.groups = new_groups

    def create_group(self, private_group_info: GroupPrivateInfo, local_group_name: str, group_infos: set[GroupInfo]):
        owner_group_file = decrypt_history(
            private_group_info.owner_private_identity,
            Shared.deserialize(self.server.get_file(private_group_info.public_info.root_file_identifier)).history,
            private_group_info.public_info.trusted_snapshot_index,
        )

        shared, group_private_identity = create_group(
            owner_group_file.private_identity,
            "Hello world!",
            {member.public_identity for member in group_infos},
        )
        root_file_identifier = Identifier.generate()
        metagroup_info = GroupInfo(root_file_identifier, 0, group_private_identity.get_public_identity())
        self.server.set_file(root_file_identifier, shared.serialize())
        for group_info in group_infos:
            shared = Shared.deserialize(self.server.get_file(group_info.root_file_identifier))
            shared.invitations[local_group_name] = metagroup_info
            self.server.set_file(group_info.root_file_identifier, shared.serialize())
        self.groups[local_group_name] = GroupPrivateInfo(metagroup_info, owner_group_file.private_identity)

    def add_member(self, local_group_name: str, member: PublicIdentity) -> GroupInfo:
        group_private_info = self.groups[local_group_name]
        shared = Shared.deserialize(self.server.get_file(group_private_info.public_info.root_file_identifier))
        group_private_identity = add_member(
            group_private_info.owner_private_identity,
            shared,
            member,
            group_private_info.public_info.trusted_snapshot_index,
        )
        group_info = GroupInfo(
            group_private_info.public_info.root_file_identifier,
            len(shared.history.snapshots) - 1,
            group_private_identity.get_public_identity(),
        )
        self.server.set_file(group_info.root_file_identifier, shared.serialize())
        self.groups[local_group_name] = GroupPrivateInfo(group_info, group_private_info.owner_private_identity)
        return group_info

    def get_content(self, local_group_name: str) -> str:
        group_info = self.groups[local_group_name]
        root_file = decrypt_history(
            group_info.owner_private_identity,
            Shared.deserialize(self.server.get_file(group_info.public_info.root_file_identifier)).history,
            group_info.public_info.trusted_snapshot_index,
        )
        return root_file.content


server = Server()

# Create device A
device_A = Client(server)

# Create team 1 consisting of device A
device_A.create_group(device_A.groups["base"], "team 1", {device_A.groups["base"].public_info})

device_A.discover()

assert device_A.get_content("team 1") == "Hello world!"

# Create device B
device_B = Client(server)

# Pass public identity of device B from device B to device A

# Add device B to team 1
team_1_info = device_A.add_member("team 1", device_B.groups["base"].owner_private_identity.get_public_identity())

# Pass team 1 info from device A to device B

# Accept invitation
device_B.add_to_group("team 1", team_1_info)

assert device_A.get_content("team 1") == "Hello world!"
assert device_B.get_content("team 1") == "Hello world!"

# Create device C
device_C = Client(server)

# Create team 2 consisting of device C
device_C.create_group(device_C.groups["base"], "team 2", {device_C.groups["base"].public_info})

assert device_C.get_content("team 2") == "Hello world!"

# Pass group info identity of team 2 from device C to device A

company_info = device_A.create_group(
    device_A.groups["team 1"],
    "company",
    {
        device_A.groups["team 1"].public_info,
        device_C.groups["team 2"].public_info,
    },
)

device_A.discover()
device_C.discover()

assert device_A.get_content("company") == "Hello world!"
assert device_C.get_content("company") == "Hello world!"
