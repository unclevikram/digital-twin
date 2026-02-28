import { createGitHubClient, createGitHubGraphQL } from './client'
import { RateLimiter } from './rate-limiter'
import { sleep } from '@/lib/utils'
import type {
  GitHubDataResult,
  GitHubProfile,
  RepoData,
  CommitData,
  PRData,
  IssueData,
  ReadmeData,
  LanguageStats,
  ContributionData,
  FetchProgress,
} from './types'

const MAX_REPOS = 30
const COMMITS_PER_REPO = 30
const PRS_PER_REPO = 20
const ISSUES_PER_REPO = 20

type ProgressCallback = (progress: FetchProgress) => void

/**
 * The crown jewel of the data integration layer.
 * Orchestrates comprehensive extraction of GitHub data for RAG ingestion.
 */
export async function fetchGitHubData(
  accessToken: string,
  onProgress?: ProgressCallback,
): Promise<GitHubDataResult> {
  const startTime = Date.now()
  const client = createGitHubClient(accessToken)
  const gql = createGitHubGraphQL(accessToken)
  const rateLimiter = new RateLimiter({ defaultDelayMs: 100, lowLimitThreshold: 100, lowLimitDelayMs: 2000 })

  const report = (step: string, current: number, total: number) => {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0
    onProgress?.({ step, current, total, percentage })
    console.log(`[Fetcher] ${step} (${percentage}%)`)
  }

  // ---- Step 1: Profile ----
  report('Fetching profile...', 0, 100)
  await rateLimiter.wait()

  const { data: userData } = await client.users.getAuthenticated()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rateLimiter.updateFromHeaders(userData as any)

  const profile: GitHubProfile = {
    login: userData.login,
    name: userData.name ?? null,
    bio: userData.bio ?? null,
    company: userData.company ?? null,
    location: userData.location ?? null,
    blog: userData.blog ?? null,
    email: userData.email ?? null,
    avatarUrl: userData.avatar_url,
    followers: userData.followers,
    following: userData.following,
    publicRepos: userData.public_repos,
    createdAt: userData.created_at,
    htmlUrl: userData.html_url,
  }

  // ---- Step 2: Repos ----
  report('Fetching repositories...', 5, 100)
  await rateLimiter.wait()

  const allRepos: RepoData[] = []
  let page = 1
  while (allRepos.length < MAX_REPOS) {
    const { data: reposData } = await client.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: 'updated',
      type: 'all',
      page,
    })
    if (!Array.isArray(reposData) || reposData.length === 0) break
    for (const repo of reposData) {
      allRepos.push({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description ?? null,
        language: repo.language ?? null,
        stargazersCount: repo.stargazers_count ?? 0,
        forksCount: repo.forks_count ?? 0,
        topics: repo.topics ?? [],
        createdAt: repo.created_at ?? new Date().toISOString(),
        updatedAt: repo.updated_at ?? new Date().toISOString(),
        htmlUrl: repo.html_url,
        private: repo.private,
        fork: repo.fork,
        defaultBranch: repo.default_branch,
        size: repo.size ?? 0,
      })
      if (allRepos.length >= MAX_REPOS) break
    }
    if (!Array.isArray(reposData) || reposData.length < 100) break
    page++
  }

  const repos = allRepos.slice(0, MAX_REPOS)
  const totalRepos = repos.length

  // ---- Step 3-7: Per-repo data ----
  const languages: Record<string, number> = {}
  const readmes: ReadmeData[] = []
  const commits: CommitData[] = []
  const pullRequests: PRData[] = []
  const issues: IssueData[] = []

  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i]
    const progressBase = 10 + Math.round((i / totalRepos) * 70)
    report(`Processing ${repo.name} (${i + 1}/${totalRepos})...`, progressBase, 100)

    // Languages
    try {
      await rateLimiter.wait()
      const { data: langData } = await client.repos.listLanguages({
        owner: repo.fullName.split('/')[0],
        repo: repo.name,
      })
      for (const [lang, bytes] of Object.entries(langData)) {
        languages[lang] = (languages[lang] ?? 0) + (bytes as number)
      }
    } catch {
      // Ignore language fetch failures
    }

    // README
    try {
      await rateLimiter.wait()
      const { data: readmeData } = await client.repos.getReadme({
        owner: repo.fullName.split('/')[0],
        repo: repo.name,
        mediaType: { format: 'raw' },
      })
      const readmeContent = (readmeData as unknown as string) ?? ''
      readmes.push({
        repo: repo.name,
        content: readmeContent,
        encoding: 'utf-8',
        size: readmeContent.length,
      })
    } catch {
      // 404 is expected for repos without READMEs
    }

    // Commits
    try {
      await rateLimiter.wait()
      const { data: commitsData } = await client.repos.listCommits({
        owner: repo.fullName.split('/')[0],
        repo: repo.name,
        author: profile.login,
        per_page: COMMITS_PER_REPO,
      })
      for (const commit of commitsData) {
        commits.push({
          sha: commit.sha,
          message: commit.commit.message.split('\n')[0], // First line only
          date: commit.commit.author?.date ?? new Date().toISOString(),
          url: commit.html_url,
          repo: repo.name,
          author: commit.commit.author?.name ?? profile.login,
        })
      }
    } catch {
      // Empty repos or permission errors
    }

    // Pull Requests
    try {
      await rateLimiter.wait()
      const { data: prsData } = await client.pulls.list({
        owner: repo.fullName.split('/')[0],
        repo: repo.name,
        state: 'all',
        per_page: PRS_PER_REPO,
        sort: 'updated',
        direction: 'desc',
      })
      for (const pr of prsData) {
        // Only include PRs created by the authenticated user
        if (pr.user?.login !== profile.login) continue
        pullRequests.push({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body ?? null,
          state: pr.state as 'open' | 'closed',
          merged: !!pr.merged_at,
          mergedAt: pr.merged_at ?? null,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          url: pr.html_url,
          repo: repo.name,
          labels: pr.labels.map((l) => (typeof l === 'string' ? l : l.name ?? '')).filter(Boolean),
          draft: pr.draft ?? false,
        })
      }
    } catch {
      // Ignore PR fetch failures
    }

    // Issues (filter out PRs from issues endpoint)
    try {
      await rateLimiter.wait()
      const { data: issuesData } = await client.issues.listForRepo({
        owner: repo.fullName.split('/')[0],
        repo: repo.name,
        state: 'all',
        creator: profile.login,
        per_page: ISSUES_PER_REPO,
        sort: 'updated',
        direction: 'desc',
      })
      for (const issue of issuesData) {
        // GitHub returns PRs from the issues endpoint — skip them
        if ('pull_request' in issue) continue
        issues.push({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          body: issue.body ?? null,
          state: issue.state as 'open' | 'closed',
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          closedAt: issue.closed_at ?? null,
          url: issue.html_url,
          repo: repo.name,
          labels: issue.labels
            .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
            .filter(Boolean),
        })
      }
    } catch {
      // Ignore issues fetch failures
    }
  }

  // ---- Step 8: Language percentages ----
  const totalBytes = Object.values(languages).reduce((a, b) => a + b, 0)
  const languageStats: LanguageStats = {}
  for (const [lang, bytes] of Object.entries(languages)) {
    languageStats[lang] = {
      bytes,
      percentage: totalBytes > 0 ? Math.round((bytes / totalBytes) * 1000) / 10 : 0,
    }
  }

  // ---- Step 9: Contribution Graph (GraphQL) ----
  report('Fetching contribution graph...', 85, 100)
  let contributions: ContributionData = {
    totalCommitContributions: 0,
    totalPullRequestContributions: 0,
    totalIssueContributions: 0,
    totalRepositoryContributions: 0,
    restrictedContributionsCount: 0,
    totalContributions: 0,
    weeks: [],
  }

  try {
    const contributionQuery = `
      query($login: String!) {
        user(login: $login) {
          contributionsCollection {
            totalCommitContributions
            totalPullRequestContributions
            totalIssueContributions
            totalRepositoryContributions
            restrictedContributionsCount
            contributionCalendar {
              totalContributions
              weeks {
                firstDay
                contributionDays {
                  date
                  contributionCount
                  weekday
                }
              }
            }
          }
        }
      }
    `

    const result = await gql<{
      user: {
        contributionsCollection: {
          totalCommitContributions: number
          totalPullRequestContributions: number
          totalIssueContributions: number
          totalRepositoryContributions: number
          restrictedContributionsCount: number
          contributionCalendar: {
            totalContributions: number
            weeks: Array<{
              firstDay: string
              contributionDays: Array<{
                date: string
                contributionCount: number
                weekday: number
              }>
            }>
          }
        }
      }
    }>(contributionQuery, { login: profile.login })

    const cc = result.user.contributionsCollection
    const calendar = cc.contributionCalendar

    // Determine peak activity time (simplified heuristic)
    const weekdayCounts = [0, 0, 0, 0, 0, 0, 0]
    for (const week of calendar.weeks) {
      for (const day of week.contributionDays) {
        weekdayCounts[day.weekday] += day.contributionCount
      }
    }
    const mostActiveDayIdx = weekdayCounts.indexOf(Math.max(...weekdayCounts))
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    contributions = {
      totalCommitContributions: cc.totalCommitContributions,
      totalPullRequestContributions: cc.totalPullRequestContributions,
      totalIssueContributions: cc.totalIssueContributions,
      totalRepositoryContributions: cc.totalRepositoryContributions,
      restrictedContributionsCount: cc.restrictedContributionsCount,
      totalContributions: calendar.totalContributions,
      weeks: calendar.weeks,
      mostActiveDay: dayNames[mostActiveDayIdx],
      peakActivity: 'afternoon', // Default; could be derived from commit timestamps
    }
  } catch (err) {
    console.warn('[Fetcher] Failed to fetch contribution graph:', err)
  }

  report('Fetch complete!', 100, 100)

  const fetchDurationMs = Date.now() - startTime

  return {
    profile,
    repos,
    commits,
    pullRequests,
    issues,
    readmes,
    languages: languageStats,
    contributions,
    fetchedAt: new Date().toISOString(),
    stats: {
      totalRepos: repos.length,
      totalCommits: commits.length,
      totalPRs: pullRequests.length,
      totalIssues: issues.length,
      totalReadmes: readmes.length,
      fetchDurationMs,
    },
  }
}
