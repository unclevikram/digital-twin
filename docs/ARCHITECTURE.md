# System Architecture — Digital Twin MVP

## Overview

The Digital Twin MVP is a RAG-powered AI chatbot that responds as Vikramsingh Rathod, grounded in real data pulled from his GitHub account via OAuth.

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         INGESTION PIPELINE                                │
│                                                                           │
│  GitHub API ──── Fetcher ──── Chunker ──── Embeddings ──── Vectra Index  │
│  (REST+GraphQL)  (30 repos)  (8 types)   (text-embed-3)   (file-backed)  │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                         QUERY PIPELINE                                    │
│                                                                           │
│  User Query ─── Embedding ─── Vector Search ─── Context Builder          │
│                                                        │                  │
│                                               System Prompt               │
│                                                        │                  │
│                                            gpt-4o-mini (streaming)        │
│                                                        │                  │
│                                          Streamed Response → UI           │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Map

```
src/
├── app/
│   ├── page.tsx              → Landing page with GitHub OAuth sign-in
│   ├── chat/page.tsx         → Protected chat interface
│   └── api/
│       ├── auth/             → Auth.js v5 OAuth handler
│       ├── chat/             → Streaming chat endpoint (Vercel AI SDK)
│       ├── ingest/           → Trigger ingestion pipeline (fire-and-forget)
│       └── ingest/status/   → Poll ingestion progress
│
├── lib/
│   ├── github/               → DATA INTEGRATION DEEP-DIVE
│   │   ├── client.ts         → Authenticated Octokit factory
│   │   ├── fetcher.ts        → Comprehensive data extraction orchestrator
│   │   ├── rate-limiter.ts   → Rate limit tracking + adaptive backoff
│   │   └── types.ts          → GitHub data type definitions
│   │
│   ├── ingestion/
│   │   ├── chunker.ts        → 8 type-specific chunking strategies
│   │   ├── pipeline.ts       → Fetch → Chunk → Embed → Store orchestration
│   │   └── status.ts         → In-memory ingestion progress tracking
│   │
│   ├── rag/
│   │   ├── retriever.ts      → Query embedding + vector search + filtering
│   │   ├── context-builder.ts → Dedup + rank + truncate context assembly
│   │   └── prompts.ts        → First-person system prompt templates
│   │
│   ├── vector-store.ts       → VectorStore interface + Vectra implementation
│   ├── embeddings.ts         → OpenAI text-embedding-3-small utility
│   └── env.ts                → Zod-validated environment variables
│
└── components/
    ├── chat/                 → Chat UI (messages, input, debug panel)
    ├── ingestion/            → Ingestion progress + data summary
    └── layout/               → Header with debug toggle
```

## Chunking Architecture

The chunking layer is the most architecturally significant part of the RAG pipeline. Each GitHub data type requires a different strategy:

| Type | Strategy | Rationale |
|------|----------|-----------|
| Profile | 1 chunk, first-person template | Biographical data is atomic |
| Repo overview | 1 chunk per repo | Metadata is self-contained |
| README | Split by H2/H3 headers, 400-token target, 50-token overlap | Preserves semantic sections, overlap avoids boundary splits |
| Commits | Batch 7 per chunk, grouped by repo | Preserves patterns over individual messages |
| Pull Requests | 1 chunk per PR, body truncated at 500 chars | PR is a logical unit |
| Issues | 1 chunk per issue | Same as PRs |
| Languages | 1 global summary chunk | Aggregated percentage view |
| Contributions | 1 global summary chunk | Calendar stats are narrative |

## Authentication Flow

```
User → GitHub OAuth → Authorization code → Auth.js callback
     → JWT with access_token stored → Session exposes token
     → Octokit client created with user's token per request
```

This design means each user's data is fetched using their own OAuth token, respecting their GitHub permissions.

## Deployment Considerations

**Vercel free tier constraints:**
- 10-second function timeout → ingestion uses fire-and-forget pattern
- Ephemeral filesystem → vector index requires re-ingestion on cold starts
- For production: replace Vectra with Pinecone or pgvector

**Vectra persistence:** The `vector-index/` directory is written to the filesystem. On Vercel, this persists within a deployment instance but resets on cold starts. This is documented as a known limitation.
