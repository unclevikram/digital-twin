// ============================================
// GitHub Data Type Definitions
// ============================================

export interface GitHubProfile {
  login: string
  name: string | null
  bio: string | null
  company: string | null
  location: string | null
  blog: string | null
  email: string | null
  avatarUrl: string
  followers: number
  following: number
  publicRepos: number
  createdAt: string
  htmlUrl: string
}

export interface RepoData {
  id: number
  name: string
  fullName: string
  description: string | null
  language: string | null
  stargazersCount: number
  forksCount: number
  topics: string[]
  createdAt: string
  updatedAt: string
  htmlUrl: string
  private: boolean
  fork: boolean
  defaultBranch: string
  size: number
}

export interface CommitData {
  sha: string
  message: string
  date: string
  url: string
  repo: string
  author: string
}

export interface PRData {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  merged: boolean
  mergedAt: string | null
  createdAt: string
  updatedAt: string
  url: string
  repo: string
  labels: string[]
  draft: boolean
}

export interface IssueData {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  createdAt: string
  updatedAt: string
  closedAt: string | null
  url: string
  repo: string
  labels: string[]
}

export interface ReadmeData {
  repo: string
  content: string
  encoding: string
  size: number
}

export interface LanguageStats {
  [language: string]: {
    bytes: number
    percentage: number
  }
}

export interface ContributionData {
  totalCommitContributions: number
  totalPullRequestContributions: number
  totalIssueContributions: number
  totalRepositoryContributions: number
  restrictedContributionsCount: number
  totalContributions: number
  weeks: ContributionWeek[]
  mostActiveDay?: string
  peakActivity?: string // morning/afternoon/evening
}

export interface ContributionWeek {
  firstDay: string
  contributionDays: ContributionDay[]
}

export interface ContributionDay {
  date: string
  contributionCount: number
  weekday: number
}

export interface GitHubDataResult {
  profile: GitHubProfile
  repos: RepoData[]
  commits: CommitData[]
  pullRequests: PRData[]
  issues: IssueData[]
  readmes: ReadmeData[]
  languages: LanguageStats
  contributions: ContributionData
  fetchedAt: string
  stats: {
    totalRepos: number
    totalCommits: number
    totalPRs: number
    totalIssues: number
    totalReadmes: number
    fetchDurationMs: number
  }
}

export interface FetchProgress {
  step: string
  current: number
  total: number
  percentage: number
}
