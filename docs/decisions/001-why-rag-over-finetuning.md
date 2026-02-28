# ADR 001: Why RAG Over Fine-Tuning

**Status:** Accepted
**Date:** 2024-10

## Context

The digital twin needs to answer questions about Vikram's technical background grounded in real GitHub data. Two approaches were considered: Retrieval-Augmented Generation (RAG) or fine-tuning a base model on the data.

## Decision

Use RAG with `gpt-4o-mini` and a local vector store.

## Rationale

**Transparent, attributable responses**
RAG forces the model to cite specific retrieved chunks. When the twin says "In my `api-service` project, I...", it's because a `repo_overview` or `commit` chunk was retrieved with high relevance. Fine-tuned models bake knowledge into weights, making it impossible to audit which "training example" informed a response.

**No training cost or data lock-in**
Fine-tuning `gpt-4o-mini` would require preparing JSONL training data, waiting for the fine-tune job, and paying per-training-token. RAG is instantaneous — ingest once, retrieve always.

**Easy to update**
When Vikram pushes new code, clicking "Sync GitHub Data" re-ingests the updated data. With fine-tuning, the model would need to be retrained. RAG treats the knowledge base as a live, mutable index.

**Honest "I don't know" behavior**
When no relevant chunks are retrieved (score < 0.3 threshold), the system prompt instructs the model to acknowledge the gap rather than hallucinate. Fine-tuned models are more prone to confabulation since they blend training data with parametric memory.

**Scope fit**
Fine-tuning `gpt-4o-mini` is not generally available via the API for this use case at the time of writing. RAG is the right tool for dynamic, document-grounded question answering.

## Trade-offs

- RAG adds latency: ~100-200ms for embedding + vector search before the LLM call
- Context window limits how much data can be injected per query (mitigated by top-K retrieval)
- Retrieved context quality depends on embedding model quality (`text-embedding-3-small` is well-suited here)
