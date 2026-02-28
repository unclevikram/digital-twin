# ADR 002: Why Vectra Over Pinecone

**Status:** Accepted
**Date:** 2024-10

## Context

The RAG pipeline requires a vector store to index embeddings and serve nearest-neighbor queries. Options considered: Pinecone (hosted), pgvector (self-hosted Postgres), Chroma (local), Vectra (file-backed local).

## Decision

Use Vectra for the MVP scope.

## Rationale

**Zero infrastructure**
Vectra stores its index in a local JSON file under `vector-index/`. No accounts required, no API keys beyond OpenAI, no Docker, no cloud setup. The reviewer can clone the repo, set env vars, and run `npm run dev` with nothing else installed.

**Reviewer experience first**
The most important audience for this MVP is a technical reviewer at Viven Engineering. The fewer things that can go wrong during their setup, the better. Pinecone requires account creation, project setup, and another API key to manage. Vectra requires nothing.

**File-backed persistence**
Unlike in-memory stores, Vectra persists to disk across server restarts. Within a local dev environment, this means ingesting once and reusing the index across sessions.

**Interface abstraction signals production-readiness**
The `VectorStore` interface in `src/lib/vector-store.ts` abstracts away the Vectra implementation. Swapping to Pinecone, pgvector, or Weaviate requires only implementing the 5-method interface — the rest of the system is unaffected.

## Trade-offs

- **Not production-scale:** Vectra is a JSON file — it would be impractical beyond ~10K vectors. This is fine for a single developer's GitHub history (~200-500 chunks).
- **No distributed access:** A hosted service like Pinecone would support multi-user scenarios. Documented in FUTURE-WORK.md.
- **Ephemeral on Vercel:** The serverless filesystem resets on cold starts. The README documents this limitation and recommends Pinecone for production deployment.

## Migration Path

```typescript
// Current (Vectra)
const store = new VectraVectorStore('./vector-index')

// Future (Pinecone) — same interface, different implementation
const store = new PineconeVectorStore({ apiKey: env.PINECONE_API_KEY, index: 'digital-twin' })
```

The calling code in `pipeline.ts` and `retriever.ts` would not change at all.
