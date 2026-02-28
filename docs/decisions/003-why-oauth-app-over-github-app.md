# ADR 003: Why OAuth App Over GitHub App

**Status:** Accepted
**Date:** 2024-10

## Context

GitHub offers two integration mechanisms: OAuth Apps (classic) and GitHub Apps (modern, more granular). Both can read repository data. The choice affects setup complexity, token lifecycle, and permission scope.

## Decision

Use a GitHub OAuth App via Auth.js v5's GitHub provider.

## Rationale

**Simpler setup**
OAuth Apps require: create app → set callback URL → copy client ID and secret. GitHub Apps require: create app → define permissions → install to account/repos → handle webhooks (optional) → generate private key for JWT signing. For a take-home project, the OAuth App approach lets a reviewer authenticate in 3 steps vs. 10+.

**No installation flow**
GitHub Apps must be "installed" to an account or organization before they can access data. This adds friction for the reviewer trying to test with their own GitHub account. OAuth Apps work immediately after authorization.

**Auth.js first-class support**
`next-auth@beta` ships a GitHub provider that handles the OAuth App flow out of the box. The `access_token` is surfaced in the JWT callback with zero additional configuration.

**Token simplicity**
OAuth App tokens don't expire (no refresh logic needed). GitHub App installation tokens expire after 1 hour and require server-side refresh using the App's private key. Fewer moving parts = fewer failure modes.

## Trade-offs

- **Broad scope:** The `repo` scope grants both read AND write access to repositories. We only need read. A GitHub App could be scoped to `contents: read` only.
- **User-context tokens:** OAuth App tokens act on behalf of the user. If the user revokes the token, the next request fails gracefully (401 from GitHub).
- **Rate limit:** OAuth App tokens are rate-limited per-user (5000 req/hr), shared across all instances of the app that the user has authorized. For a single-user MVP, this is not a concern.

## Scope Decision

The GitHub OAuth App requests these scopes:
- `repo` — Read access to private repositories (needed if user has private repos to scan)
- `read:user` — Access to user profile data
- `user:email` — Access to the user's primary email

The `repo` write permissions are unused but cannot be avoided with OAuth Apps. A GitHub App installation would allow `contents: read` only — recommended for a production deployment.
