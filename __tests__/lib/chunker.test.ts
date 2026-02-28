import { describe, it, expect } from 'vitest'
import {
  chunkProfile,
  chunkRepos,
  chunkReadme,
  chunkCommits,
  chunkPullRequests,
  chunkIssues,
  chunkLanguages,
  chunkContributions,
} from '@/lib/ingestion/chunker'
import type { GitHubProfile, RepoData, CommitData, PRData, IssueData, ReadmeData } from '@/lib/github/types'

// ---- Fixtures ----

const mockProfile: GitHubProfile = {
  login: 'unclevikram',
  name: 'Vikramsingh Rathod',
  bio: 'Backend engineer passionate about system design',
  company: 'Viven Engineering',
  location: 'San Francisco, CA',
  blog: 'https://vikram.dev',
  email: 'vikram@example.com',
  avatarUrl: 'https://avatars.githubusercontent.com/u/123456',
  followers: 42,
  following: 18,
  publicRepos: 25,
  createdAt: '2019-03-15T00:00:00Z',
  htmlUrl: 'https://github.com/unclevikram',
}

const mockRepo: RepoData = {
  id: 1,
  name: 'api-service',
  fullName: 'unclevikram/api-service',
  description: 'A high-performance REST API built with FastAPI',
  language: 'Python',
  stargazersCount: 12,
  forksCount: 3,
  topics: ['fastapi', 'python', 'rest-api'],
  createdAt: '2022-01-01T00:00:00Z',
  updatedAt: '2024-10-15T00:00:00Z',
  htmlUrl: 'https://github.com/unclevikram/api-service',
  private: false,
  fork: false,
  defaultBranch: 'main',
  size: 1024,
}

const mockCommits: CommitData[] = Array.from({ length: 12 }, (_, i) => ({
  sha: `abc${i}`,
  message: `feat: add feature ${i + 1}`,
  date: `2024-0${Math.floor(i / 3) + 1}-${(i % 3 + 1) * 5}T10:00:00Z`,
  url: `https://github.com/unclevikram/api-service/commit/abc${i}`,
  repo: 'api-service',
  author: 'Vikramsingh Rathod',
}))

const mockPR: PRData = {
  id: 101,
  number: 5,
  title: 'Add JWT authentication middleware',
  body: 'This PR adds JWT-based authentication to all protected endpoints. Implements token refresh logic and proper error handling for expired tokens.',
  state: 'closed',
  merged: true,
  mergedAt: '2024-06-15T00:00:00Z',
  createdAt: '2024-06-10T00:00:00Z',
  updatedAt: '2024-06-15T00:00:00Z',
  url: 'https://github.com/unclevikram/api-service/pull/5',
  repo: 'api-service',
  labels: ['enhancement', 'security'],
  draft: false,
}

const mockIssue: IssueData = {
  id: 201,
  number: 3,
  title: 'Rate limiting not working for anonymous users',
  body: 'When unauthenticated requests exceed the rate limit, the server returns 500 instead of 429.',
  state: 'closed',
  createdAt: '2024-05-01T00:00:00Z',
  updatedAt: '2024-05-10T00:00:00Z',
  closedAt: '2024-05-10T00:00:00Z',
  url: 'https://github.com/unclevikram/api-service/issues/3',
  repo: 'api-service',
  labels: ['bug'],
}

const mockReadme: ReadmeData = {
  repo: 'api-service',
  content: `# API Service

A production-ready REST API.

## Installation

\`\`\`bash
pip install -r requirements.txt
\`\`\`

## Features

- JWT authentication
- Rate limiting
- OpenAPI documentation

### Sub-section

More details here.

## Usage

Run the server with uvicorn.`,
  encoding: 'utf-8',
  size: 300,
}

// ============================================================
// Tests
// ============================================================

describe('chunkProfile', () => {
  it('produces exactly one chunk', () => {
    const chunks = chunkProfile(mockProfile)
    expect(chunks).toHaveLength(1)
  })

  it('uses first-person template with correct data', () => {
    const [chunk] = chunkProfile(mockProfile)
    expect(chunk.text).toContain('Vikramsingh Rathod')
    expect(chunk.text).toContain('San Francisco, CA')
    expect(chunk.text).toContain('Viven Engineering')
    expect(chunk.text).toContain('2019')
    expect(chunk.text).toContain('25 public repositories')
    expect(chunk.text).toContain('42 followers')
  })

  it('has type "profile"', () => {
    const [chunk] = chunkProfile(mockProfile)
    expect(chunk.type).toBe('profile')
    expect(chunk.metadata.type).toBe('profile')
  })

  it('has a stable deterministic ID', () => {
    const [chunk1] = chunkProfile(mockProfile)
    const [chunk2] = chunkProfile(mockProfile)
    expect(chunk1.id).toBe(chunk2.id)
  })
})

describe('chunkRepos', () => {
  it('produces one chunk per repo', () => {
    const chunks = chunkRepos([mockRepo, mockRepo])
    expect(chunks).toHaveLength(2)
  })

  it('includes repo name and description', () => {
    const [chunk] = chunkRepos([mockRepo])
    expect(chunk.text).toContain('api-service')
    expect(chunk.text).toContain('FastAPI')
    expect(chunk.text).toContain('Python')
  })

  it('mentions stars and topics', () => {
    const [chunk] = chunkRepos([mockRepo])
    expect(chunk.text).toContain('12 stars')
    expect(chunk.text).toContain('fastapi')
  })

  it('returns empty array for no repos', () => {
    expect(chunkRepos([])).toHaveLength(0)
  })
})

describe('chunkReadme', () => {
  it('splits on markdown headers', () => {
    const chunks = chunkReadme(mockReadme)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('prefixes each chunk with [repo_name]', () => {
    const chunks = chunkReadme(mockReadme)
    for (const chunk of chunks) {
      expect(chunk.text).toMatch(/^\[api-service\]/)
    }
  })

  it('returns empty array for empty README', () => {
    const empty: ReadmeData = { ...mockReadme, content: '' }
    expect(chunkReadme(empty)).toHaveLength(0)
  })

  it('has type "readme" for all chunks', () => {
    const chunks = chunkReadme(mockReadme)
    for (const chunk of chunks) {
      expect(chunk.type).toBe('readme')
    }
  })

  it('sets repo in metadata', () => {
    const chunks = chunkReadme(mockReadme)
    for (const chunk of chunks) {
      expect(chunk.metadata.repo).toBe('api-service')
    }
  })
})

describe('chunkCommits', () => {
  it('batches commits into groups of ~7', () => {
    const chunks = chunkCommits(mockCommits)
    // 12 commits / 7 per batch = 2 chunks
    expect(chunks).toHaveLength(2)
  })

  it('groups by repo', () => {
    const mixedCommits: CommitData[] = [
      ...mockCommits.slice(0, 3).map((c) => ({ ...c, repo: 'repo-a' })),
      ...mockCommits.slice(0, 3).map((c) => ({ ...c, repo: 'repo-b' })),
    ]
    const chunks = chunkCommits(mixedCommits)
    expect(chunks.length).toBe(2) // One chunk per repo
    const repos = chunks.map((c) => c.metadata.repo)
    expect(repos).toContain('repo-a')
    expect(repos).toContain('repo-b')
  })

  it('each chunk has type "commit"', () => {
    const chunks = chunkCommits(mockCommits)
    for (const chunk of chunks) {
      expect(chunk.type).toBe('commit')
    }
  })

  it('returns empty for no commits', () => {
    expect(chunkCommits([])).toHaveLength(0)
  })

  it('includes commit messages in text', () => {
    const chunks = chunkCommits(mockCommits)
    expect(chunks[0].text).toContain('feat: add feature')
  })
})

describe('chunkPullRequests', () => {
  it('produces one chunk per PR', () => {
    expect(chunkPullRequests([mockPR, mockPR])).toHaveLength(2)
  })

  it('truncates body at 500 chars', () => {
    const longBodyPR: PRData = {
      ...mockPR,
      body: 'a'.repeat(1000),
    }
    const [chunk] = chunkPullRequests([longBodyPR])
    expect(chunk.text.length).toBeLessThan(600) // title + truncated body
  })

  it('handles null body gracefully', () => {
    const noBodPR: PRData = { ...mockPR, body: null }
    const [chunk] = chunkPullRequests([noBodPR])
    expect(chunk.text).toContain(mockPR.title)
  })

  it('marks merged PRs correctly', () => {
    const [chunk] = chunkPullRequests([mockPR])
    expect(chunk.text).toContain('merged')
  })

  it('includes labels in metadata', () => {
    const [chunk] = chunkPullRequests([mockPR])
    expect(chunk.metadata.labels).toContain('security')
  })
})

describe('chunkIssues', () => {
  it('produces one chunk per issue', () => {
    expect(chunkIssues([mockIssue, mockIssue])).toHaveLength(2)
  })

  it('includes issue title in text', () => {
    const [chunk] = chunkIssues([mockIssue])
    expect(chunk.text).toContain('Rate limiting not working')
  })

  it('returns empty for no issues', () => {
    expect(chunkIssues([])).toHaveLength(0)
  })
})

describe('chunkLanguages', () => {
  it('produces exactly one chunk', () => {
    const langs = {
      Python: { bytes: 50000, percentage: 60 },
      TypeScript: { bytes: 30000, percentage: 36 },
      Shell: { bytes: 3333, percentage: 4 },
    }
    const chunks = chunkLanguages(langs)
    expect(chunks).toHaveLength(1)
  })

  it('includes language names and percentages', () => {
    const langs = {
      Python: { bytes: 50000, percentage: 60.5 },
    }
    const [chunk] = chunkLanguages(langs)
    expect(chunk.text).toContain('Python')
    expect(chunk.text).toContain('60.5%')
  })

  it('returns empty for no languages', () => {
    expect(chunkLanguages({})).toHaveLength(0)
  })
})

describe('chunkContributions', () => {
  it('produces exactly one chunk', () => {
    const contrib = {
      totalCommitContributions: 234,
      totalPullRequestContributions: 18,
      totalIssueContributions: 7,
      totalRepositoryContributions: 5,
      restrictedContributionsCount: 12,
      totalContributions: 271,
      weeks: [],
      mostActiveDay: 'Wednesday',
      peakActivity: 'afternoon',
    }
    const chunks = chunkContributions(contrib)
    expect(chunks).toHaveLength(1)
  })

  it('mentions commit and PR counts', () => {
    const contrib = {
      totalCommitContributions: 234,
      totalPullRequestContributions: 18,
      totalIssueContributions: 7,
      totalRepositoryContributions: 5,
      restrictedContributionsCount: 0,
      totalContributions: 259,
      weeks: [],
    }
    const [chunk] = chunkContributions(contrib)
    expect(chunk.text).toContain('234 commits')
    expect(chunk.text).toContain('18 pull requests')
  })
})
