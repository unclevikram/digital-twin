/**
 * Seed script — populates the vector store with synthetic but realistic
 * data so the app works without a real GitHub account.
 *
 * Run with: npm run seed
 * Requires: OPENAI_API_KEY in .env.local
 */

import path from 'path'
import fs from 'fs/promises'

// Load env vars from .env.local
import { config } from 'dotenv'
config({ path: path.join(process.cwd(), '.env.local') })

if (!process.env.OPENAI_API_KEY?.startsWith('sk-')) {
  console.error('❌ OPENAI_API_KEY is required in .env.local')
  process.exit(1)
}

import { VectraVectorStore } from '../src/lib/vector-store'
import { generateEmbeddings } from '../src/lib/embeddings'
import type { DataChunk } from '../src/types'

const VECTOR_INDEX_DIR = path.join(process.cwd(), 'vector-index')

// ---- Synthetic data chunks ----
const demoChunks: Omit<DataChunk, 'id'>[] = [
  // Profile
  {
    text: "My name is Vikramsingh Rathod. I'm based in San Francisco, CA. I work at Viven Engineering. My bio: Backend-focused engineer passionate about system design, distributed systems, and developer tooling. I've been on GitHub since 2019. I have 25 public repositories and 42 followers.",
    type: 'profile',
    metadata: { type: 'profile', url: 'https://github.com/unclevikram' },
  },

  // Language summary
  {
    text: 'My primary programming languages based on my GitHub repositories: TypeScript (42.3%), Python (28.1%), Go (12.4%), JavaScript (10.2%), Shell (4.5%), Dockerfile (2.5%).',
    type: 'language_summary',
    metadata: { type: 'language_summary' },
  },

  // Contribution summary
  {
    text: 'In the past year, I made 234 commits, opened 18 pull requests, created 7 issues, and created 5 new repositories. My total contribution count is 259. My most active day of the week is Wednesday. I tend to be most active in the afternoon.',
    type: 'contribution_summary',
    metadata: { type: 'contribution_summary' },
  },

  // Repos
  {
    text: 'I have a project called api-gateway: A high-performance API gateway built with Go, featuring rate limiting, JWT authentication, and observability. It\'s primarily written in Go with 47 stars. Topics: golang, api-gateway, rate-limiting, observability. Last updated: October 2024. URL: https://github.com/unclevikram/api-gateway.',
    type: 'repo_overview',
    metadata: { type: 'repo_overview', repo: 'api-gateway', language: 'Go', url: 'https://github.com/unclevikram/api-gateway' },
  },
  {
    text: 'I have a project called fastapi-boilerplate: Production-ready FastAPI template with async SQLAlchemy, Alembic migrations, Redis caching, and Docker support. It\'s primarily written in Python with 31 stars. Topics: fastapi, python, postgresql, redis, docker. Last updated: September 2024. URL: https://github.com/unclevikram/fastapi-boilerplate.',
    type: 'repo_overview',
    metadata: { type: 'repo_overview', repo: 'fastapi-boilerplate', language: 'Python', url: 'https://github.com/unclevikram/fastapi-boilerplate' },
  },
  {
    text: 'I have a project called event-stream: Real-time event streaming system using Kafka, written in TypeScript. Supports at-least-once and exactly-once delivery semantics. It\'s primarily written in TypeScript with 18 stars. Topics: kafka, typescript, streaming, microservices. Last updated: August 2024. URL: https://github.com/unclevikram/event-stream.',
    type: 'repo_overview',
    metadata: { type: 'repo_overview', repo: 'event-stream', language: 'TypeScript', url: 'https://github.com/unclevikram/event-stream' },
  },
  {
    text: 'I have a project called k8s-deploy-scripts: Kubernetes deployment automation scripts and Helm charts for microservices. It\'s primarily written in Shell with 9 stars. Topics: kubernetes, helm, devops, automation. Last updated: July 2024. URL: https://github.com/unclevikram/k8s-deploy-scripts.',
    type: 'repo_overview',
    metadata: { type: 'repo_overview', repo: 'k8s-deploy-scripts', language: 'Shell', url: 'https://github.com/unclevikram/k8s-deploy-scripts' },
  },
  {
    text: 'I have a project called digital-twin: AI digital twin built with Next.js, RAG, and GitHub OAuth. It\'s primarily written in TypeScript. Topics: nextjs, rag, ai, digital-twin. Last updated: October 2024. URL: https://github.com/unclevikram/digital-twin.',
    type: 'repo_overview',
    metadata: { type: 'repo_overview', repo: 'digital-twin', language: 'TypeScript', url: 'https://github.com/unclevikram/digital-twin' },
  },

  // READMEs
  {
    text: '[api-gateway] # API Gateway\n\nA production-ready API gateway written in Go. Designed for high-throughput workloads with built-in observability.\n\n## Features\n\n- JWT authentication with configurable JWKS endpoint\n- Token bucket rate limiting per client\n- Prometheus metrics and OpenTelemetry tracing\n- Circuit breaker pattern for upstream failures\n- Request/response transformation middleware',
    type: 'readme',
    metadata: { type: 'readme', repo: 'api-gateway', section: 'Features' },
  },
  {
    text: '[api-gateway] ## Architecture\n\nThe gateway uses a plugin-based middleware chain. Each request passes through: authentication → rate limiting → routing → upstream proxy → response transformation.\n\nUpstream services are registered via a YAML config file and discovered at startup. Health checks run every 30 seconds.',
    type: 'readme',
    metadata: { type: 'readme', repo: 'api-gateway', section: 'Architecture' },
  },
  {
    text: '[fastapi-boilerplate] # FastAPI Boilerplate\n\nProduction-ready FastAPI template designed for backend engineers who want to ship quickly without compromising on quality.\n\n## Tech Stack\n\n- FastAPI + Pydantic v2 for typed request/response models\n- Async SQLAlchemy 2.0 + Alembic for database migrations\n- Redis for caching and rate limiting\n- Celery + Redis for background tasks\n- Docker + Docker Compose for local development',
    type: 'readme',
    metadata: { type: 'readme', repo: 'fastapi-boilerplate', section: 'Tech Stack' },
  },
  {
    text: '[event-stream] # Event Stream\n\nA TypeScript library for building event-driven microservices on top of Apache Kafka.\n\n## Key Concepts\n\nEvents are strongly typed using Zod schemas. Producers serialize events to JSON; consumers validate and deserialize with full type safety. The library handles reconnection, consumer group rebalancing, and dead-letter queues automatically.',
    type: 'readme',
    metadata: { type: 'readme', repo: 'event-stream', section: 'Key Concepts' },
  },

  // Commits
  {
    text: '[api-gateway] Recent commits:\n- Oct 15, 2024: feat: add circuit breaker with configurable thresholds\n- Oct 12, 2024: fix: race condition in token bucket rate limiter\n- Oct 8, 2024: perf: reduce allocations in request parsing hot path\n- Oct 3, 2024: docs: add runbook for circuit breaker tuning\n- Sep 28, 2024: refactor: extract middleware chain into separate package\n- Sep 22, 2024: test: add load tests for rate limiting\n- Sep 18, 2024: feat: add OTEL tracing to all upstream requests',
    type: 'commit',
    metadata: { type: 'commit', repo: 'api-gateway', date: '2024-10-15T00:00:00Z' },
  },
  {
    text: '[fastapi-boilerplate] Recent commits:\n- Sep 30, 2024: feat: add Redis-based rate limiting middleware\n- Sep 25, 2024: fix: properly close async DB sessions on exception\n- Sep 20, 2024: feat: implement refresh token rotation\n- Sep 15, 2024: refactor: migrate to Pydantic v2 model validators\n- Sep 10, 2024: feat: add background task queue with Celery\n- Sep 5, 2024: docs: update deployment guide for Railway\n- Sep 1, 2024: test: add integration tests for auth flow',
    type: 'commit',
    metadata: { type: 'commit', repo: 'fastapi-boilerplate', date: '2024-09-30T00:00:00Z' },
  },
  {
    text: '[event-stream] Recent commits:\n- Aug 28, 2024: feat: implement exactly-once semantics via idempotent producer\n- Aug 22, 2024: fix: handle consumer group rebalance during processing\n- Aug 18, 2024: feat: add dead-letter queue with configurable retry policy\n- Aug 12, 2024: refactor: improve type inference for event schemas\n- Aug 8, 2024: perf: batch message acknowledgment to reduce broker calls',
    type: 'commit',
    metadata: { type: 'commit', repo: 'event-stream', date: '2024-08-28T00:00:00Z' },
  },

  // Pull Requests
  {
    text: '[api-gateway] PR (merged): Implement circuit breaker pattern\nAdds a circuit breaker middleware that opens after 5 consecutive upstream failures and half-opens after a configurable timeout. Prevents cascading failures across the gateway. Includes Prometheus metrics for circuit state transitions.',
    type: 'pull_request',
    metadata: { type: 'pull_request', repo: 'api-gateway', date: '2024-10-14T00:00:00Z', labels: ['enhancement', 'reliability'], url: 'https://github.com/unclevikram/api-gateway/pull/23' },
  },
  {
    text: '[fastapi-boilerplate] PR (merged): Add async background task queue\nImplements Celery worker integration with Redis as broker. Tasks are typed with Pydantic and retried with exponential backoff. Includes health check endpoint for worker status.',
    type: 'pull_request',
    metadata: { type: 'pull_request', repo: 'fastapi-boilerplate', date: '2024-09-08T00:00:00Z', labels: ['feature'], url: 'https://github.com/unclevikram/fastapi-boilerplate/pull/14' },
  },
  {
    text: '[event-stream] PR (merged): Implement dead-letter queue\nMessages that fail after max_retries are routed to a dedicated DLQ topic. Consumers can replay DLQ messages after fixing the underlying issue. DLQ depth is tracked as a Prometheus gauge.',
    type: 'pull_request',
    metadata: { type: 'pull_request', repo: 'event-stream', date: '2024-08-11T00:00:00Z', labels: ['feature', 'reliability'], url: 'https://github.com/unclevikram/event-stream/pull/8' },
  },

  // Issues
  {
    text: '[api-gateway] Issue (closed): Memory leak in connection pool under high load\nUnder sustained load (>10k req/s), the upstream connection pool was not properly releasing idle connections, causing gradual memory growth. Fixed by implementing a max idle connection timeout.',
    type: 'issue',
    metadata: { type: 'issue', repo: 'api-gateway', date: '2024-09-01T00:00:00Z', labels: ['bug', 'performance'], url: 'https://github.com/unclevikram/api-gateway/issues/19' },
  },
  {
    text: '[fastapi-boilerplate] Issue (closed): SQLAlchemy sessions not closed on 422 validation errors\nWhen Pydantic validation fails before the route handler runs, the async DB session was not properly closed, causing connection pool exhaustion under load.',
    type: 'issue',
    metadata: { type: 'issue', repo: 'fastapi-boilerplate', date: '2024-09-23T00:00:00Z', labels: ['bug'], url: 'https://github.com/unclevikram/fastapi-boilerplate/issues/11' },
  },
]

async function main() {
  console.log('🌱 Seeding demo data...\n')
  await fs.mkdir(VECTOR_INDEX_DIR, { recursive: true })

  const store = new VectraVectorStore(VECTOR_INDEX_DIR)
  await store.initialize()

  console.log(`📦 Generating embeddings for ${demoChunks.length} chunks...`)

  const texts = demoChunks.map((c) => c.text)
  const embeddings = await generateEmbeddings(texts)

  console.log(`✅ Generated ${embeddings.length} embeddings`)
  console.log(`💾 Storing in vector index...`)

  const chunksWithIds = demoChunks.map((chunk, i) => ({
    id: `demo:${chunk.type}:${i}`,
    text: chunk.text,
    embedding: embeddings[i],
    metadata: chunk.metadata,
  }))

  await store.addChunks(chunksWithIds)

  const stats = await store.getStats()
  console.log(`\n✨ Seed complete!`)
  console.log(`   Total chunks: ${stats.totalChunks}`)
  console.log(`   By type:`)
  for (const [type, count] of Object.entries(stats.chunksByType)) {
    console.log(`     ${type}: ${count}`)
  }
  console.log(`\n👉 Run 'npm run dev' and visit http://localhost:3000`)
  console.log(`   Sign in with any GitHub account to start chatting.`)
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
