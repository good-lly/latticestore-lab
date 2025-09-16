# Build Journal

### Day 8 - 2025-09-16 - Directories work. Conflict resolution works. UI barely works.

Shipped:

- Directory creation with validation (no Windows reserved names, no weird Unicode, 255 char limit)
- Optimistic conflict resolution on PUT /update-rootfile - if etags don't match, server returns both versions. Client decides - merges.
- S3 fallback when Redis cache misses - fetch from cold storage, warm the cache, carry on
- Files now display in UI (cwdFiles finally populated from rootFileData Map)
- Spend a day with a lot of operations, configurations, etc ...

Reality: Directory names get validated but files don't upload into them yet. The file browser shows folders you can't enter. Classic day 8 - everything half works.
rootFileData is now a Map instead of array. Why? O(1) lookups beat array.find() when you have 10,000 files.
Tomorrow: Make directories actually navigable. Rewrite into smart merging strategy. No CRDT complexity.

### Day 7 - 2025-09-15 - Parallel uploads, S3 backend, and SSE magic

System generates encryption keys now automatically per-file, now - 32 bytes of randomness, done.
Big architectural shift today: Redis is just metadata now. Actual files go to S3 (via s3mini library). Why? Redis wasn't built to store 100MB videos. S3 was. Simple.

#### What actually shipped:

- Parallel chunk uploads with worker pools (navigator.hardwareConcurrency workers, capped at 2. After several tests 2 seems optimal for most multicore machines - more just clogs up the network + added overhead for managing more workers)
- Batch processing - workers grab chunks from a shared queue instead of one-file-per-worker (supports multiple simultaneous uploads now plus large files)
- SSE endpoint for real-time sync notifications. When file changes on server, all clients know instantly
- LatStore class (Lattice Store) - the actual sync engine. Handles auth, tracks etags, manages workers ... more to come.
  WIP - Stay tuned!

### Day 5 & Day 6 - 2025-09-10 - FileBrowsing / upload / download / dummy user registration / etc / everything is in WIP

After a short break in Ireland, grinding the basics again. File browser UI - half done. Upload/download with WebWorkers - works on my machine™. Dummy auth - exists. The real story: I'm sitting here implementing file uploads and realizing Yjs might be complete overkill for this.
CRDTs are for Google Docs-style collaboration - character by character, real-time cursors. But we're building file sync. Nobody edits the same photo simultaneously in iCloud. They upload, download, maybe conflict once a month? I'm building a Ferrari engine for a pickup truck.
Still coding (nothing's finished yet), but questioning everything. Do we need:
Full CRDT merging? Or just last-write-wins + version history?
Yjs's 100KB? Or 10 lines of timestamp/inner logic-counter comparison?
Complex conflict resolution? Or just "here's both versions, you pick"?
Tomorrow I either commit to CRDTs or rip them out entirely. But first, need to get this demo working enough to show someone that it's not completely broken. Check `/project` if you want to see the mess in progress.

### Day 4 - 2025-09-02 - Real-time CRDT Implementation / FileBrowser

- Three days of CRDT libraries and I'm done. They're either dying, or documentation nightmares. I have to move on. Time to build on what actually works. Starting with the simplest possible stack: vanilla JS + AlpineJS for the UI. Simple vite middleware and hono, no 500MB node_modules. Plus just HTML that works.
  Architecture: CloudFlare Workers + Redis + S3. Why? Because it runs everywhere, scales to zero, and costs nothing until it works. Got the skeleton running (`/project` - try it yourself). Tomorrow we make files actually sync. Don't forget to change .env vars!

### Day 3 - 2025-09-1 - Other CRDTs: Progress and Challenges

### Problems / and solutions?

- What happens when you delete unsynced data in iCloud/Google Drive/Dropbox?

  - Google Drive: does not have a specific feature to "handle collisions on deleted files" but rather manages file deletion by moving items to the Trash, where they remain for 30 days before permanent deletion. If a file is permanently deleted or removed from Trash, it is generally gone forever, though Workspace administrators may have a limited ability to restore it for a short window. A collision is a separate issue where duplicate files are created, often due to syncing problems, and typically requires manual reorganization to resolve.
  - Dropbox: When a file is deleted, it's moved to a temporary "deleted files" folder, giving you a grace period (30 days to over a year, depending on your plan) to recover it. Beyond this period, files are marked for permanent deletion. If you encounter an unexpected deletion, it's often due to a linked device or the file being moved outside the synced folder, and you should check your activity history.
  - yjs/ycrdt: if i edit deleted part of string on another device YJS will basically insert edit as a new string while removing the deleted part.

### What was evaluated

- Found some very interesting projects like https://www.secsync.com/ / https://github.com/nikgraf/secsync
- Explored various CRDT implementations and their approaches to handling deleted data. Automerge / YJS
- Analyzed the performance and usability of different CRDT libraries.
- Conducted tests on how each library manages conflicts and data consistency.

**Tomorrow**

- Let's make some serious step forward and implement a basic CRDT for real-time syncing on the web at first.

### Day 2 - 2025-08-29 - Are Android CRDTs a wasteland?

### Problem

- Every Yjs Android implementation is either dead (last commit: 2019) or dying.
- Investigate WebSocket integration for real-time colab.
- Encryption strategies and data structure.

### What was evaluated

- Went tru a bunch of outdated projects like https://github.com/y-crdt/ykt
- Almost went nuclear and tried running JS directly in Android using JSEngine. Thank god I found the Kotlin implementation before that disaster and crossed fingers that it will work.

**What worked:**

- Found https://github.com/netless-io/yjs-android which is a more recent implementation but no recent updates or activity. Check out the `/experiments/week1/y-java` directory for more details. Code is in Kotlin. Got websockets talking. Data flies. Nothing merges yet.
- Small win: Ondrej (The Cryptographer) is sketching out our encryption approach for collaboration. Meeting next week.

**Tomorrow**

- Make CRDTs actually merge on Android (currently they just wave at each other)
- Test what happens when you delete unsynced data in iCloud/Google Drive/Dropbox
- Find someone who's built a distributed system and has experience with CRDTs.
  **PS: If you know distributed systems and want to build something great, DM me.**

### Day 1 - 2025-08-28 - CRDT experiments

- Woke up to a rejection from NLnet foundation. They don't think LatticeStore is worth funding. Pity.

### Problem

- Explore merging strategies for CRDTs in collaborative applications.
- Implement basic CRDT for real-time syncing and test out different implementations.

### What was evaluated

- **json-joy**: Great project but documentation was too inconsistent
- **Automerge**: Good conflict resolution but 5x slower than alternatives. Interesting article ->> ([Josephg's benchmarks](https://josephg.com/blog/crdts-go-brrr/))
- **Yjs/Y-CRDT**: Best performance, 100KB lib size, has Rust core + other tools + community + documentation

  **What worked:**

- `Yjs / Ycrdt` provides a good foundation for CRDT implementation with nice documentation and community support. Also found -> https://github.com/TimoWilhelm/yjs-cf-ws-provider which is very nice and simple <3 / lovely idea that worked with `week 1/crdt/index5.html` implementation.

**Tomorrow**

- check kotlin/java implementation of Ycrdt
- meeting with the team to discuss encryption and data schema
