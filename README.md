# vikram.digital — AI Digital Twin

> An AI chatbot that responds **as Vikramsingh Rathod** — in first person, grounded in real GitHub data.

Built as part of the Viven Engineering take-home assignment, deep-diving into **Data Integrations & Authentication**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    INGESTION PIPELINE                    │
│                                                          │
│  GitHub API → Fetcher → Chunker → Embeddings → Vectra   │
│  (OAuth token)  (30 repos)  (8 types)  (OpenAI)  (file) │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    QUERY PIPELINE                        │
│                                                          │
│  User Query → Embed → Vector Search → Context Builder   │
│                                              ↓           │
│                                       System Prompt      │
│                                              ↓           │
│                                     gpt-4o-mini (stream) │
│                                              ↓           │
│                                     First-person response│
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
git clone https://github.com/unclevikram/digital-twin
cd digital-twin
cp .env.example .env.local
# Fill in env vars (see below)
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with GitHub, and click **Sync GitHub Data**.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description | How to get it |
|----------|-------------|---------------|
| `AUTH_GITHUB_ID` | GitHub OAuth App Client ID | [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App Client Secret | Same page, after creating the app |
| `AUTH_SECRET` | Auth.js signing secret (≥32 chars) | `openssl rand -hex 32` |
| `OPENAI_API_KEY` | OpenAI API key | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `NEXT_PUBLIC_APP_URL` | App URL (default: `http://localhost:3000`) | Change for production |

### GitHub OAuth App Setup

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. Set **Homepage URL**: `http://localhost:3000`
3. Set **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. Copy **Client ID** and generate a **Client Secret**

---

## Deep-Dive: Data Integrations & Authentication

### Why GitHub?

GitHub is the richest signal of a developer's actual work. Unlike a resume (static, curated), GitHub data is:
- **Verifiable**: commit history, real code, actual contributions
- **Temporal**: timestamps show how someone's skills evolved
- **Behavioral**: commit patterns reveal working style, code review habits, and project ownership

### OAuth Flow & Scope Decisions

Authentication uses Auth.js v5 with a GitHub OAuth App. The flow:

1. User clicks "Sign in with GitHub"
2. GitHub OAuth redirects to `GET /api/auth/callback/github`
3. Auth.js exchanges the authorization code for an `access_token`
4. The token is stored in the session JWT (never in a database)
5. Every API call that needs GitHub data extracts the token from the session

Scopes requested: `repo read:user user:email`

The `repo` scope includes private repos — necessary if the user has private repositories worth including in their twin's knowledge base. See [ADR 003](docs/decisions/003-why-oauth-app-over-github-app.md) for the OAuth App vs. GitHub App tradeoff.

### Data Extraction

The fetcher ([`src/lib/github/fetcher.ts`](src/lib/github/fetcher.ts)) orchestrates extraction in 8 steps:

1. **Profile** — name, bio, location, company, GitHub stats
2. **Repositories** — up to 30 most recently updated repos (timeout-safe on free Vercel tier)
3. **Languages** — per-repo language byte counts, aggregated into global percentages
4. **READMEs** — raw markdown content, fetched with `Accept: application/vnd.github.raw+json`
5. **Commits** — up to 30 commits per repo, filtered to the authenticated user
6. **Pull Requests** — up to 20 PRs per repo (all states), filtered to the user
7. **Issues** — up to 20 issues per repo, with PRs filtered out (GitHub returns PRs from the issues endpoint)
8. **Contribution Graph** — via GraphQL `contributionsCollection`: total counts + calendar heatmap

Requests are processed **sequentially** with a 100ms delay between calls to avoid GitHub's secondary rate limits. The `RateLimiter` class reads `x-ratelimit-remaining` headers and slows down automatically when below 100 remaining requests.

Raw fetched data is persisted to `vector-index/raw-github-data.json` before chunking — decoupling the two steps for easier debugging.

### Chunking Strategies

Each data type gets a purpose-built chunking strategy (see [`src/lib/ingestion/chunker.ts`](src/lib/ingestion/chunker.ts)):

| Type | Strategy | Why |
|------|----------|-----|
| Profile | 1 chunk, first-person template | Atomic biographical data |
| Repo | 1 chunk per repo | Self-contained project metadata |
| README | Split by H2/H3 headers, 400-token target, 50-token overlap | Semantic sections + boundary safety |
| Commits | Batch 7 per chunk by repo | Preserves activity patterns over isolated messages |
| PRs/Issues | 1 chunk each, body truncated at 500 chars | Logical unit, bounded size |
| Languages | 1 global summary | Aggregated percentage view |
| Contributions | 1 global summary | Narrative calendar stats |

Chunks have **deterministic IDs** (hash of type + repo + index), enabling upsert behavior on re-ingestion.

### Extensible Architecture

Adding a new data source (Google Calendar, Notion, Linear) requires:
1. A new fetcher function in `src/lib/github/` (or a new `src/lib/{source}/`)
2. A new chunking function in `src/lib/ingestion/chunker.ts`
3. Wiring into the pipeline in `src/lib/ingestion/pipeline.ts`

The `VectorStore` interface and embedding layer are fully source-agnostic.

---

## Design Decisions

- [ADR 001: Why RAG over Fine-Tuning](docs/decisions/001-why-rag-over-finetuning.md)
- [ADR 002: Why Vectra over Pinecone](docs/decisions/002-why-vectra-over-pinecone.md)
- [ADR 003: Why OAuth App over GitHub App](docs/decisions/003-why-oauth-app-over-github-app.md)

---

## Demo Without GitHub

To run the app with synthetic data (no GitHub account needed):

```bash
# Ensure OPENAI_API_KEY is set in .env.local
npm run seed
npm run dev
```

The seed script generates ~50 realistic chunks representing a typical developer profile.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Auth | Auth.js v5 (`next-auth@beta`) + GitHub OAuth |
| GitHub API | `@octokit/rest` (REST) + `@octokit/graphql` (GraphQL) |
| LLM | OpenAI `gpt-4o-mini` via Vercel AI SDK |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims) |
| Vector Store | Vectra (file-backed, zero infrastructure) |
| Styling | Tailwind CSS 3 + "Terminal Luxe" design system |
| Validation | Zod (env vars + API inputs) |
| Testing | Vitest |

---

## Production Deployment (Vercel)

1. Push to GitHub, connect repo to Vercel
2. Set all env vars in Vercel dashboard (same as `.env.example`)
3. Update GitHub OAuth App callback URL to production domain
4. **Important:** The Vectra vector index is ephemeral on Vercel (filesystem resets on cold starts). Re-ingestion is needed after cold starts. For production, swap Vectra for Pinecone using the `VectorStore` interface.

---

## Future Work

See [docs/FUTURE-WORK.md](docs/FUTURE-WORK.md) for a detailed list of planned improvements including incremental sync, Pinecone migration, multi-user support, and conversation memory.

---

*Built with Node.js 20 · Vikramsingh Rathod · Viven Engineering Take-Home*
