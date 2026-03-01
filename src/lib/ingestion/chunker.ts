import { generateId, truncate, estimateTokens } from '@/lib/utils'
import type { DataChunk } from '@/types'
import type {
  GitHubProfile,
  RepoData,
  CommitData,
  PRData,
  IssueData,
  ReadmeData,
  LanguageStats,
  ContributionData,
} from '@/lib/github/types'

const README_TARGET_TOKENS = 400
const README_MAX_TOKENS = 500
const README_OVERLAP_TOKENS = 50
const COMMIT_BATCH_SIZE = 7
const PR_BODY_MAX_CHARS = 500
const ISSUE_BODY_MAX_CHARS = 500

// ---- Profile Chunk ----

export function chunkProfile(profile: GitHubProfile): DataChunk[] {
  const text = [
    `My name is ${profile.name ?? profile.login}.`,
    profile.location ? `I'm based in ${profile.location}.` : '',
    profile.company ? `I work at ${profile.company}.` : '',
    profile.bio ? `My bio: ${profile.bio}.` : '',
    `I've been on GitHub since ${new Date(profile.createdAt).getFullYear()}.`,
    `I have ${profile.publicRepos} public repositories and ${profile.followers} followers.`,
    profile.blog ? `You can find more about me at ${profile.blog}.` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return [
    {
      id: generateId(['profile', profile.login]),
      text,
      type: 'profile',
      metadata: {
        type: 'profile',
        source: 'github',
        url: profile.htmlUrl,
      },
    },
  ]
}

// ---- Repo Overview Chunks ----

export function chunkRepos(repos: RepoData[]): DataChunk[] {
  return repos.map((repo) => {
    const topicsStr = repo.topics.length > 0 ? `Topics: ${repo.topics.join(', ')}.` : ''
    const text = [
      `I have a project called ${repo.name}${repo.description ? `: ${repo.description}` : ''}.`,
      repo.language ? `It's primarily written in ${repo.language}.` : '',
      repo.stargazersCount > 0 ? `It has ${repo.stargazersCount} stars.` : '',
      topicsStr,
      `Last updated: ${new Date(repo.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}.`,
      `URL: ${repo.htmlUrl}.`,
    ]
      .filter(Boolean)
      .join(' ')

    return {
      id: generateId(['repo_overview', repo.name]),
      text,
      type: 'repo_overview' as const,
      metadata: {
        type: 'repo_overview' as const,
        source: 'github',
        repo: repo.name,
        language: repo.language ?? undefined,
        url: repo.htmlUrl,
        date: repo.updatedAt,
      },
    }
  })
}

// ---- README Chunks ----

/**
 * Splits README content by markdown headers into chunks.
 * Each section becomes a chunk, with 50-token overlap between consecutive chunks.
 * If a section exceeds 500 tokens, it's split at paragraph boundaries.
 */
export function chunkReadme(readme: ReadmeData): DataChunk[] {
  if (!readme.content || readme.content.trim().length === 0) return []

  const prefix = `[${readme.repo}] `
  const chunks: DataChunk[] = []

  // Split by H2 and H3 headers
  const sections = readme.content.split(/(?=^#{2,3}\s)/m).filter((s) => s.trim().length > 0)

  let chunkIndex = 0
  let prevChunkTail = '' // Overlap content from previous chunk

  for (const section of sections) {
    const fullText = prevChunkTail ? prevChunkTail + '\n' + section.trim() : section.trim()
    const prefixedText = prefix + fullText

    if (estimateTokens(prefixedText) <= README_MAX_TOKENS) {
      chunks.push({
        id: generateId(['readme', readme.repo, String(chunkIndex)]),
        text: prefixedText,
        type: 'readme',
        metadata: {
          type: 'readme',
          source: 'github',
          repo: readme.repo,
          section: extractHeaderText(section),
        },
      })

      // Save the last ~50 tokens as overlap for next chunk
      prevChunkTail = getLastNTokens(section, README_OVERLAP_TOKENS)
      chunkIndex++
    } else {
      // Split oversized section at paragraph boundaries
      const paragraphs = section.split(/\n\n+/).filter((p) => p.trim().length > 0)
      let currentChunk = prevChunkTail ? prevChunkTail + '\n' : ''

      for (const paragraph of paragraphs) {
        const candidate = currentChunk + paragraph + '\n\n'
        if (estimateTokens(prefix + candidate) > README_TARGET_TOKENS && currentChunk.trim().length > 0) {
          chunks.push({
            id: generateId(['readme', readme.repo, String(chunkIndex)]),
            text: prefix + currentChunk.trim(),
            type: 'readme',
            metadata: {
              type: 'readme',
              source: 'github',
              repo: readme.repo,
              section: extractHeaderText(section),
            },
          })
          prevChunkTail = getLastNTokens(currentChunk, README_OVERLAP_TOKENS)
          currentChunk = prevChunkTail + '\n' + paragraph + '\n\n'
          chunkIndex++
        } else {
          currentChunk += paragraph + '\n\n'
        }
      }

      if (currentChunk.trim().length > 0) {
        chunks.push({
          id: generateId(['readme', readme.repo, String(chunkIndex)]),
          text: prefix + currentChunk.trim(),
          type: 'readme',
          metadata: {
            type: 'readme',
            repo: readme.repo,
            section: extractHeaderText(section),
          },
        })
        prevChunkTail = getLastNTokens(currentChunk, README_OVERLAP_TOKENS)
        chunkIndex++
      }
    }
  }

  return chunks
}

// ---- Commit Chunks ----

/**
 * Groups commits by repo and batches them (7 per chunk).
 * Preserves the pattern of what someone works on rather than treating commits as isolated.
 */
export function chunkCommits(commits: CommitData[]): DataChunk[] {
  if (commits.length === 0) return []

  // Group by repo
  const byRepo: Record<string, CommitData[]> = {}
  for (const commit of commits) {
    if (!byRepo[commit.repo]) byRepo[commit.repo] = []
    byRepo[commit.repo].push(commit)
  }

  const chunks: DataChunk[] = []

  for (const [repo, repoCommits] of Object.entries(byRepo)) {
    // Batch in groups of COMMIT_BATCH_SIZE
    for (let i = 0; i < repoCommits.length; i += COMMIT_BATCH_SIZE) {
      const batch = repoCommits.slice(i, i + COMMIT_BATCH_SIZE)
      const commitLines = batch
        .map((c) => `- ${new Date(c.date).toLocaleDateString('en-US')}: ${c.message}`)
        .join('\n')

      const text = `[${repo}] Recent commits:\n${commitLines}`

      chunks.push({
        id: generateId(['commit', repo, String(Math.floor(i / COMMIT_BATCH_SIZE))]),
        text,
        type: 'commit',
        metadata: {
          type: 'commit',
          source: 'github',
          repo,
          date: batch[0].date,
          url: batch[0].url,
        },
      })
    }
  }

  return chunks
}

// ---- Pull Request Chunks ----

export function chunkPullRequests(prs: PRData[]): DataChunk[] {
  return prs.map((pr) => {
    const stateLabel = pr.merged ? 'merged' : pr.state
    const bodyText = pr.body ? truncate(pr.body, PR_BODY_MAX_CHARS) : ''
    const text = `[${pr.repo}] PR (${stateLabel}): ${pr.title}${bodyText ? `\n${bodyText}` : ''}`

    return {
      id: generateId(['pull_request', pr.repo, String(pr.number)]),
      text,
      type: 'pull_request' as const,
      metadata: {
        type: 'pull_request' as const,
        source: 'github',
        repo: pr.repo,
        date: pr.createdAt,
        url: pr.url,
        labels: pr.labels,
      },
    }
  })
}

// ---- Issue Chunks ----

export function chunkIssues(issues: IssueData[]): DataChunk[] {
  return issues.map((issue) => {
    const bodyText = issue.body ? truncate(issue.body, ISSUE_BODY_MAX_CHARS) : ''
    const text = `[${issue.repo}] Issue (${issue.state}): ${issue.title}${bodyText ? `\n${bodyText}` : ''}`

    return {
      id: generateId(['issue', issue.repo, String(issue.number)]),
      text,
      type: 'issue' as const,
      metadata: {
        type: 'issue' as const,
        source: 'github',
        repo: issue.repo,
        date: issue.createdAt,
        url: issue.url,
        labels: issue.labels,
      },
    }
  })
}

// ---- Language Summary Chunk ----

export function chunkLanguages(languages: LanguageStats): DataChunk[] {
  const sorted = Object.entries(languages)
    .sort((a, b) => b[1].percentage - a[1].percentage)
    .slice(0, 10) // Top 10 languages

  if (sorted.length === 0) return []

  const languageList = sorted
    .map(([lang, stats]) => `${lang} (${stats.percentage}%)`)
    .join(', ')

  const text = `My primary programming languages based on my GitHub repositories: ${languageList}.`

  return [
    {
      id: generateId(['language_summary', 'global']),
      text,
      type: 'language_summary',
      metadata: {
        type: 'language_summary',
        source: 'github',
      },
    },
  ]
}

// ---- Contribution Summary Chunk ----

export function chunkContributions(contributions: ContributionData): DataChunk[] {
  const text = [
    `In the past year, I made ${contributions.totalCommitContributions} commits,`,
    `opened ${contributions.totalPullRequestContributions} pull requests,`,
    `created ${contributions.totalIssueContributions} issues,`,
    `and created ${contributions.totalRepositoryContributions} new repositories.`,
    `My total contribution count is ${contributions.totalContributions}.`,
    contributions.mostActiveDay
      ? `My most active day of the week is ${contributions.mostActiveDay}.`
      : '',
    contributions.peakActivity
      ? `I tend to be most active in the ${contributions.peakActivity}.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return [
    {
      id: generateId(['contribution_summary', 'global']),
      text,
      type: 'contribution_summary',
      metadata: {
        type: 'contribution_summary',
        source: 'github',
      },
    },
  ]
}

// ---- Helper Functions ----

function extractHeaderText(section: string): string {
  const match = section.match(/^#{2,3}\s+(.+)/m)
  return match ? match[1].trim() : ''
}

function getLastNTokens(text: string, tokenCount: number): string {
  const charCount = tokenCount * 4 // ~4 chars per token
  if (text.length <= charCount) return text
  return text.slice(-charCount)
}
