# Future Work

## Integrations

- **Google Calendar integration** — Answer "when am I free?" and "what meetings do I have?" by connecting the Google Calendar API. The RAG pipeline is designed to accommodate additional data sources.
- **Notion integration** — Ingest personal notes, project docs, and database entries from Notion to give the twin awareness of internal thinking and documentation.
- **Linear/Jira integration** — Surface engineering project context: active sprints, assigned tickets, resolved issues.
- **Blog/portfolio CMS** — Ingest published posts and portfolio pages to let the twin discuss written work.
- **Stack Overflow activity** — Ingest answered questions to demonstrate expertise areas.

## Sync Improvements

- **Incremental sync** — Store `fetchedAt` timestamps per repo and only fetch data newer than the last sync. Dramatically reduces API calls for repeat ingestion.
- **Webhook-based real-time updates** — Use GitHub webhooks to trigger targeted re-ingestion when a push, PR, or issue event fires. Keeps the twin current without manual syncing.
- **Background job queue** — Use a job queue (BullMQ, Inngest) to decouple ingestion from the HTTP request lifecycle, enabling reliable long-running jobs on serverless platforms.

## Infrastructure

- **pgvector for production** — Replace Vectra with a PostgreSQL + pgvector extension for multi-user, persistent, queryable storage that survives serverless cold starts.
- **Pinecone / Weaviate** — Hosted vector database options with the `VectorStore` interface already defined for easy swap-in.
- **Multi-user support** — Namespace vector indices by user ID (already keyed in `status.ts`). Each user's data lives in an isolated namespace.
- **CDN/edge caching** — Cache common query embeddings to reduce OpenAI API calls for repeated questions.

## RAG Quality

- **Evaluation framework** — Build a benchmark of known question/answer pairs and measure retrieval precision@K and response accuracy against ground truth.
- **Hybrid search** — Combine dense vector search (semantic) with sparse BM25 search (keyword) for better recall on technical terms like library names.
- **Conversation memory** — Use a sliding window of previous messages as additional context, enabling follow-up questions like "tell me more about that project."
- **Reranking** — Add a cross-encoder reranker (e.g., Cohere Rerank) as a second retrieval pass for higher-precision results.
- **Query expansion** — Automatically expand terse queries ("FastAPI") into richer search strings ("FastAPI Python REST API backend framework") for better recall.

## UX

- **Mobile-optimized chat** — Full responsive design with swipe gestures for the debug panel.
- **Saved conversations** — Persist chat history in localStorage or a database.
- **Export as resume** — One-click generation of a markdown resume from the twin's knowledge base.
- **Share link** — Generate a shareable link for a read-only view of the digital twin for recruiters.
