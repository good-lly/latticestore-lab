# latticestore-lab

## What is this?

Daily build journal of LatticeStore - local-first, quantum-safe, E2EE SDK/platform that nobody owns but you. No masters.

**Status**: 🔥 Everything is on fire (in a good way)

## The context

All our data is locked-in on others people's computers (clouds/silos) and the worst part is - they read, process and monetize them.

LatticeStore: Every device holds the keys. Syncs via E2EE Quantum-resistant (ML-DSA/Kyber/AES256). Works offline. No company can "kill it", including ours. You own it.

## Architecture (stripped down version)

**What we're building:**

- **Client SDK** - A lightweight JS/TS SDK. Take care of data merge, encryption, upload/download/notifications(sync), user management, device management (WIP)
- **Server SDK** - A super simple server-side SDK for handling data storage, auth and retrieval. Quite dummy. (WIP)
- **Infra** - Infrastructure components for deployment, monitoring, and scaling. For now, running Redis as cache + some S3 storage (WIP)

**How it works:**

1. Your file gets chunked and encrypted client-side (AES256-GCM + PQC)
2. Chunks upload via Service/provider to ANY S3 bucket you control
3. Device metadata syncs via CRDT (no central coordinator) also encrypted like file chunks
4. Other devices (PQC identities) pull chunks they need, decrypt locally, merge. Chocapic!

**What makes this different:**

- No LatticeStore servers ever see your data (End-to-end encryption (E2EE) ensures only you and your devices can access it)
- Works with storage you already have (local MinIO, Garage or other S3-compatible storage)
- Quantum computer can't break it ("harvest now, decrypt later" attacks mitigated with PQC)
- Open-source, audited and free - keeps working if we disappear tomorrow

## Structure

- [/experiments](./experiments) catalog of different parts and prototypes - `cd experiments && npm i` to have fun and see what's inside
- [/project](./project) main project directory with core functionality based on experiments plus roadmap
- [JOURNAL.md](./JOURNAL.md) Daily updates in commits

## Current crisis/focus

- [week1](/experiments/week1): CRDT / merging data / encryption structure and sync. More in [JOURNAL.md](./JOURNAL.md)

## Get involved

- [Project progress](https://github.com/users/good-lly/projects/8) project board on GitHub
- [Issues](https://github.com/users/good-lly/issues) - tell me why this won't work ...
- Real-time chat in [Signal group](https://signal.group/#CjQKIGEZsuMfgmJlrLYnywMAitQreSuX5NsSlqV1mXRTbCsAEhCrDGEk4Gr1XiEaU8S6F6Dz)
- Star to watch the chaos unfold!

Part of [thinking.tools](https://thinking.tools) team project.

MIT. Fork it. Break it. Have fun.
