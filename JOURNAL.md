# Build Journal

### Week 1

#### Day 1 - 2025-08-28 - CRDT experiments

### Problem

- Explore merging strategies for CRDTs in collaborative applications.
- Implement basic CRDT for real-time syncing and test out different implementations.

### What was evaluated

- **json-joy**: Great project but documentation was too inconsistent
- **Automerge**: Good conflict resolution but 5x slower than alternatives. Interesting article ->> ([Josephg's benchmarks](https://josephg.com/blog/crdts-go-brrr/))
- **Yjs/Y-CRDT**: Best performance, 100KB lib size, has Rust core + other tools + community + documentation

  **What worked:**

- `Yjs / Ycrdt` provides a good foundation for CRDT implementation with nice documentation and community support. Also found -> https://github.com/TimoWilhelm/yjs-cf-ws-provider which is very nice and simple <3 / lovely idea that worked with `week 1/crdt/index5.html` implementation.

**TBD (tomorrow)**

- check kotlin/java implementation of Ycrdt
- meeting with the team to discuss encryption and data schema

**score 7/10**
