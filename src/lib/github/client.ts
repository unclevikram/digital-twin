import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'

/**
 * Creates an authenticated Octokit REST client.
 * Uses the session's OAuth access token for all requests.
 */
export function createGitHubClient(accessToken: string): Octokit {
  return new Octokit({
    auth: accessToken,
    userAgent: 'digital-twin/0.1.0',
    retry: {
      doNotRetry: ['429', '401', '403'],
    },
    throttle: {
      onRateLimit: (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        console.warn(
          `[GitHub] Rate limit hit for ${options.method} ${options.url}. Retry after ${retryAfter}s (attempt ${retryCount + 1})`,
        )
        return retryCount < 2
      },
      onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }) => {
        console.warn(
          `[GitHub] Secondary rate limit hit for ${options.method} ${options.url}. Retry after ${retryAfter}s`,
        )
        return false
      },
    },
  })
}

/**
 * Creates an authenticated GraphQL client for GitHub.
 * Used for contribution graph queries not available via REST.
 */
export function createGitHubGraphQL(accessToken: string) {
  return graphql.defaults({
    headers: {
      authorization: `token ${accessToken}`,
      'user-agent': 'digital-twin/0.1.0',
    },
  })
}

export type GitHubClient = ReturnType<typeof createGitHubClient>
export type GitHubGraphQL = ReturnType<typeof createGitHubGraphQL>
