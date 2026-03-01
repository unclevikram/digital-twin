import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchGitHubData } from '@/lib/github/fetcher'

// Mock the GitHub clients
const mockClient = {
  users: {
    getAuthenticated: vi.fn(),
  },
  repos: {
    listForAuthenticatedUser: vi.fn(),
    listLanguages: vi.fn(),
    getReadme: vi.fn(),
    listCommits: vi.fn(),
  },
  pulls: {
    list: vi.fn(),
  },
  issues: {
    listForRepo: vi.fn(),
  },
}

const mockGql = vi.fn()

vi.mock('@/lib/github/client', () => ({
  createGitHubClient: () => mockClient,
  createGitHubGraphQL: () => mockGql,
}))

// Mock RateLimiter to avoid delays during tests
vi.mock('@/lib/github/rate-limiter', () => ({
  RateLimiter: class {
    wait = vi.fn().mockResolvedValue(undefined)
    updateFromHeaders = vi.fn()
  },
}))

describe('fetchGitHubData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default successful responses
    mockClient.users.getAuthenticated.mockResolvedValue({
      data: {
        login: 'testuser',
        name: 'Test User',
        public_repos: 2,
        followers: 10,
        created_at: '2020-01-01T00:00:00Z',
      },
    })

    mockClient.repos.listForAuthenticatedUser.mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'repo-1',
          full_name: 'testuser/repo-1',
          description: 'A test repo',
          language: 'TypeScript',
          stargazers_count: 5,
          updated_at: '2024-01-01T00:00:00Z',
          html_url: 'https://github.com/testuser/repo-1',
          topics: ['react', 'nextjs'],
        },
        {
          id: 2,
          name: 'repo-2',
          full_name: 'testuser/repo-2',
          updated_at: '2023-12-01T00:00:00Z',
        }
      ],
    })

    mockClient.repos.listLanguages.mockResolvedValue({
      data: { TypeScript: 1000, JavaScript: 500 },
    })

    mockClient.repos.getReadme.mockResolvedValue({
      data: '# Readme Content',
    })

    mockClient.repos.listCommits.mockResolvedValue({
      data: [
        {
          sha: 'sha1',
          commit: {
            message: 'feat: initial commit',
            author: { date: '2024-01-01T00:00:00Z', name: 'Test User' },
          },
          html_url: 'commit-url',
        }
      ],
    })

    mockClient.pulls.list.mockResolvedValue({
      data: [],
    })

    mockClient.issues.listForRepo.mockResolvedValue({
      data: [],
    })

    mockGql.mockResolvedValue({
      user: {
        contributionsCollection: {
          totalCommitContributions: 50,
          contributionCalendar: {
            totalContributions: 100,
            weeks: [],
          },
        },
      },
    })
  })

  it('fetches profile data correctly', async () => {
    const result = await fetchGitHubData('fake-token')
    
    expect(result.profile.login).toBe('testuser')
    expect(result.profile.name).toBe('Test User')
    expect(result.profile.publicRepos).toBe(2)
  })

  it('fetches repositories and limits them', async () => {
    const result = await fetchGitHubData('fake-token')
    
    expect(result.repos).toHaveLength(2)
    expect(result.repos[0].name).toBe('repo-1')
    expect(result.repos[1].name).toBe('repo-2')
  })

  it('aggregates language statistics', async () => {
    // Both repos return TS:1000, JS:500
    // Total: TS:2000, JS:1000
    // Total bytes: 3000
    // TS: 66.7%, JS: 33.3%
    
    const result = await fetchGitHubData('fake-token')
    
    expect(result.languages['TypeScript'].percentage).toBeCloseTo(66.7, 1)
    expect(result.languages['JavaScript'].percentage).toBeCloseTo(33.3, 1)
  })

  it('handles empty repositories gracefully', async () => {
    mockClient.repos.listForAuthenticatedUser.mockResolvedValueOnce({ data: [] })
    
    const result = await fetchGitHubData('fake-token')
    
    expect(result.repos).toHaveLength(0)
    expect(result.profile.login).toBe('testuser')
  })

  it('handles API errors in sub-fetches gracefully', async () => {
    // README fails (404)
    mockClient.repos.getReadme.mockRejectedValue(new Error('404 Not Found'))
    
    const result = await fetchGitHubData('fake-token')
    
    // Should still succeed overall
    expect(result.repos).toHaveLength(2)
    expect(result.readmes).toHaveLength(0) // No readmes found
  })

  it('reports progress via callback', async () => {
    const progressSpy = vi.fn()
    await fetchGitHubData('fake-token', progressSpy)
    
    expect(progressSpy).toHaveBeenCalled()
    // Should have called with different steps
    expect(progressSpy).toHaveBeenCalledWith(expect.objectContaining({ step: 'Fetching profile...' }))
    expect(progressSpy).toHaveBeenCalledWith(expect.objectContaining({ step: 'Fetch complete!' }))
  })
})
