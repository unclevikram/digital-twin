import { tool } from 'ai'
import { z } from 'zod'
import { createGitHubClient, createGitHubGraphQL } from './client'

/**
 * Builds all GitHub tool definitions for the agentic RAG chat pipeline.
 *
 * These tools let gpt-4o fetch LIVE GitHub data during a conversation,
 * supplementing the static vector store with real-time information.
 *
 * The tool `description` is what the LLM reads to decide which tool to call —
 * precision here is critical for reliable tool selection.
 */
export function buildGitHubTools(accessToken: string, login: string) {
  const client = createGitHubClient(accessToken)
  const gql = createGitHubGraphQL(accessToken)

  return {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Recent Activity Feed
    // ─────────────────────────────────────────────────────────────────────────
    fetchRecentActivity: tool({
      description: `Fetches Vikram's most recent GitHub activity: commits pushed, pull requests opened/merged, and repositories created.
Use this when asked about: recent work, what was shipped/pushed/committed recently, activity today/this week/this month, what's being worked on right now, latest contributions.`,
      parameters: z.object({
        days: z.number().default(7).describe('How many days back to look (default 7)'),
      }),
      execute: async ({ days }) => {
        try {
          const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
          const { data: events } = await client.activity.listEventsForAuthenticatedUser({
            username: login,
            per_page: 100,
          })

          const relevant = events
            .filter((e) =>
              ['PushEvent', 'PullRequestEvent', 'CreateEvent', 'IssuesEvent'].includes(e.type ?? ''),
            )
            .filter((e) => new Date(e.created_at ?? '') >= new Date(since))
            .slice(0, 20)

          if (relevant.length === 0) {
            return `No public GitHub activity found in the last ${days} days.`
          }

          const lines = relevant.map((e) => {
            const date = new Date(e.created_at ?? '').toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
            const repo = e.repo.name.split('/')[1]

            if (e.type === 'PushEvent') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const payload = e.payload as any
              const msgs = (payload.commits ?? [])
                .slice(0, 3)
                .map((c: { message: string }) => c.message.split('\n')[0])
                .join('; ')
              return `[${date}] Pushed to ${repo}: ${msgs}`
            }
            if (e.type === 'PullRequestEvent') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const payload = e.payload as any
              return `[${date}] PR ${payload.action} on ${repo}: "${payload.pull_request?.title}"`
            }
            if (e.type === 'CreateEvent') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const payload = e.payload as any
              return `[${date}] Created ${payload.ref_type} "${payload.ref ?? repo}" on ${repo}`
            }
            if (e.type === 'IssuesEvent') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const payload = e.payload as any
              return `[${date}] Issue ${payload.action} on ${repo}: "${payload.issue?.title}"`
            }
            return null
          })

          return `Recent GitHub activity (last ${days} days):\n${lines.filter(Boolean).join('\n')}`
        } catch (err) {
          return `Could not fetch recent activity: ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Full Repo Details
    // ─────────────────────────────────────────────────────────────────────────
    fetchRepoDetails: tool({
      description: `Fetches comprehensive details about a specific GitHub repository: its description, tech stack, recent commits, open issues, open PRs, topics, and README summary.
Use this when asked to explain or describe a specific project by name, or when the user wants technical details about a particular repository.`,
      parameters: z.object({
        repo: z.string().describe('Repository name, e.g. "TripMind" or "rely-take-home-assessment"'),
      }),
      execute: async ({ repo }) => {
        try {
          const [repoData, languages, commits, issues, prs, readme] = await Promise.allSettled([
            client.repos.get({ owner: login, repo }),
            client.repos.listLanguages({ owner: login, repo }),
            client.repos.listCommits({ owner: login, repo, per_page: 5, author: login }),
            client.issues.listForRepo({ owner: login, repo, state: 'open', per_page: 5 }),
            client.pulls.list({ owner: login, repo, state: 'open', per_page: 5 }),
            client.repos.getReadme({ owner: login, repo, mediaType: { format: 'raw' } }),
          ])

          const lines: string[] = []

          if (repoData.status === 'fulfilled') {
            const r = repoData.value.data
            lines.push(`Repository: ${r.full_name}`)
            if (r.description) lines.push(`Description: ${r.description}`)
            lines.push(`Primary language: ${r.language ?? 'not specified'}`)
            lines.push(`Stars: ${r.stargazers_count} | Forks: ${r.forks_count}`)
            lines.push(`Created: ${new Date(r.created_at ?? '').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`)
            lines.push(`Last updated: ${new Date(r.updated_at ?? '').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
            if (r.topics && r.topics.length > 0) lines.push(`Topics: ${r.topics.join(', ')}`)
            if (r.homepage) lines.push(`Homepage: ${r.homepage}`)
          }

          if (languages.status === 'fulfilled') {
            const langs = Object.keys(languages.value.data).join(', ')
            if (langs) lines.push(`Languages used: ${langs}`)
          }

          if (readme.status === 'fulfilled') {
            const readmeText = (readme.value.data as unknown as string) ?? ''
            if (readmeText.length > 0) {
              // Include up to 3000 chars of README — enough to understand the project
              const truncated = readmeText.length > 3000
                ? readmeText.slice(0, 3000) + '\n... (truncated)'
                : readmeText
              lines.push(`\nREADME:\n${truncated}`)
            }
          }

          if (commits.status === 'fulfilled' && commits.value.data.length > 0) {
            lines.push(`\nRecent commits:`)
            for (const c of commits.value.data) {
              const date = new Date(c.commit.author?.date ?? '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              lines.push(`  - [${date}] ${c.commit.message.split('\n')[0]}`)
            }
          }

          if (prs.status === 'fulfilled' && prs.value.data.length > 0) {
            lines.push(`Open pull requests: ${prs.value.data.map((p) => `"${p.title}" (#${p.number})`).join(', ')}`)
          }

          if (issues.status === 'fulfilled') {
            const realIssues = issues.value.data.filter((i) => !('pull_request' in i))
            if (realIssues.length > 0) {
              lines.push(`Open issues: ${realIssues.map((i) => `"${i.title}" (#${i.number})`).join(', ')}`)
            }
          }

          if (lines.length === 0) {
            return `Fetched repo "${repo}" but got no data back. It may be empty or inaccessible.`
          }

          return lines.join('\n')
        } catch (err) {
          const msg = String(err)
          if (msg.includes('404')) {
            return `Repo "${repo}" not found or not accessible. Check the repo name and that the token has access (it may be private under a different owner).`
          }
          return `Could not fetch details for repo "${repo}": ${msg}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 3. File Contents
    // ─────────────────────────────────────────────────────────────────────────
    fetchFileContents: tool({
      description: `Reads the raw contents of a specific file from one of Vikram's GitHub repositories.
Use this when asked to show or explain specific code, configuration, or documentation — e.g. "show me your package.json", "what does the main.py look like", "show me the dockerfile", "how is the API structured".`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
        path: z.string().describe('File path within the repo, e.g. "package.json", "src/index.ts", "Dockerfile"'),
      }),
      execute: async ({ repo, path }) => {
        try {
          const { data } = await client.repos.getContent({ owner: login, repo, path })

          if (Array.isArray(data)) {
            // It's a directory — list the files instead
            const entries = data.map((f) => `${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n')
            return `"${path}" is a directory in ${repo}:\n${entries}`
          }

          if ('content' in data && data.encoding === 'base64') {
            const content = Buffer.from(data.content, 'base64').toString('utf-8')
            // Truncate very large files
            const truncated = content.length > 6000 ? content.slice(0, 6000) + '\n... (truncated)' : content
            return `Contents of ${repo}/${path}:\n\`\`\`\n${truncated}\n\`\`\``
          }

          return `Could not read ${path} in ${repo}`
        } catch (err) {
          return `File "${path}" not found in "${repo}": ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Repository File Tree
    // ─────────────────────────────────────────────────────────────────────────
    listRepoFiles: tool({
      description: `Lists all files and folders in a GitHub repository, showing the full directory structure.
Use this when asked about the structure, layout, or organization of a project — e.g. "what files are in X", "show me the project structure", "how is X organized", "what's in the root of X".`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
        path: z.string().default('').describe('Subdirectory to list (default: root)'),
      }),
      execute: async ({ repo, path }) => {
        try {
          // Get the default branch first
          const { data: repoData } = await client.repos.get({ owner: login, repo })
          const branch = repoData.default_branch

          // Get the git tree recursively
          const { data: branchData } = await client.repos.getBranch({ owner: login, repo, branch })
          const treeSha = branchData.commit.commit.tree.sha

          const { data: tree } = await client.git.getTree({
            owner: login,
            repo,
            tree_sha: treeSha,
            recursive: '1',
          })

          if (tree.truncated) {
            // Large repo — fall back to directory listing
            const { data: contents } = await client.repos.getContent({
              owner: login,
              repo,
              path: path || '',
            })
            if (Array.isArray(contents)) {
              return `Files in ${repo}/${path || '(root)'}:\n` +
                contents.map((f) => `  ${f.type === 'dir' ? '📁' : '📄'} ${f.name}`).join('\n')
            }
          }

          // Filter to requested path and format
          const filtered = (tree.tree ?? [])
            .filter((f) => !path || f.path?.startsWith(path))
            .filter((f) => f.type === 'blob' || f.type === 'tree')
            .slice(0, 80) // cap at 80 entries
            .map((f) => {
              const icon = f.type === 'tree' ? '📁' : '📄'
              return `${icon} ${f.path}`
            })

          return `File structure of ${repo}:\n${filtered.join('\n')}`
        } catch (err) {
          return `Could not list files for "${repo}": ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Open PRs and Issues Across All Repos
    // ─────────────────────────────────────────────────────────────────────────
    fetchOpenItems: tool({
      description: `Fetches all currently open pull requests and open issues across all of Vikram's repositories.
Use this when asked what's currently in progress, open PRs, active issues, unfinished work, or what's pending review.`,
      parameters: z.object({}),
      execute: async () => {
        try {
          const [prs, issues] = await Promise.allSettled([
            client.pulls.list({ owner: login, repo: login, state: 'open', per_page: 20 }),
            client.issues.listForAuthenticatedUser({ state: 'open', per_page: 20, filter: 'created' }),
          ])

          // Also search for open PRs authored by the user
          const prSearch = await client.search.issuesAndPullRequests({
            q: `is:pr is:open author:${login}`,
            per_page: 10,
            sort: 'updated',
            order: 'desc',
          })

          const issueSearch = await client.search.issuesAndPullRequests({
            q: `is:issue is:open author:${login}`,
            per_page: 10,
            sort: 'updated',
            order: 'desc',
          })

          const lines: string[] = []

          if (prSearch.data.items.length > 0) {
            lines.push('Open Pull Requests:')
            for (const pr of prSearch.data.items) {
              const repo = pr.repository_url.split('/').slice(-1)[0]
              lines.push(`  - [${repo}] #${pr.number}: "${pr.title}" (updated ${new Date(pr.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})`)
            }
          } else {
            lines.push('Open Pull Requests: none found')
          }

          if (issueSearch.data.items.length > 0) {
            lines.push('\nOpen Issues:')
            for (const issue of issueSearch.data.items) {
              const repo = issue.repository_url.split('/').slice(-1)[0]
              lines.push(`  - [${repo}] #${issue.number}: "${issue.title}"`)
            }
          } else {
            lines.push('\nOpen Issues: none found')
          }

          return lines.join('\n')
        } catch (err) {
          return `Could not fetch open items: ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Dependencies / Tech Stack from Package Files
    // ─────────────────────────────────────────────────────────────────────────
    fetchDependencies: tool({
      description: `Reads the dependency/package file of a repository to show the exact libraries, frameworks, and tools used.
Tries package.json (Node.js/TypeScript), requirements.txt or pyproject.toml (Python), Cargo.toml (Rust), go.mod (Go), build.gradle (Java), pubspec.yaml (Dart/Flutter).
Use this when asked about the tech stack, libraries, frameworks, packages, or dependencies of a specific project.`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
      }),
      execute: async ({ repo }) => {
        const packageFiles = [
          'package.json',
          'requirements.txt',
          'pyproject.toml',
          'Cargo.toml',
          'go.mod',
          'build.gradle',
          'pom.xml',
          'pubspec.yaml',
          'Gemfile',
          'composer.json',
        ]

        const results: string[] = []

        for (const file of packageFiles) {
          try {
            const { data } = await client.repos.getContent({ owner: login, repo, path: file })
            if (!Array.isArray(data) && 'content' in data) {
              const content = Buffer.from(data.content, 'base64').toString('utf-8')

              if (file === 'package.json') {
                try {
                  const pkg = JSON.parse(content)
                  const deps = Object.keys(pkg.dependencies ?? {})
                  const devDeps = Object.keys(pkg.devDependencies ?? {})
                  results.push(`package.json found in ${repo}:`)
                  results.push(`  Name: ${pkg.name ?? repo}`)
                  if (pkg.description) results.push(`  Description: ${pkg.description}`)
                  if (deps.length) results.push(`  Dependencies (${deps.length}): ${deps.join(', ')}`)
                  if (devDeps.length) results.push(`  Dev dependencies (${devDeps.length}): ${devDeps.join(', ')}`)
                  if (pkg.scripts) results.push(`  Scripts: ${Object.keys(pkg.scripts).join(', ')}`)
                } catch {
                  results.push(`package.json in ${repo}:\n${content.slice(0, 1000)}`)
                }
                break
              } else {
                results.push(`${file} found in ${repo}:\n${content.slice(0, 1500)}`)
                break
              }
            }
          } catch {
            // File doesn't exist in this repo — try next
          }
        }

        if (results.length === 0) {
          return `No recognized package/dependency file found in "${repo}". It may not have one or it uses an unusual build system.`
        }

        return results.join('\n')
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Commit History with Details
    // ─────────────────────────────────────────────────────────────────────────
    fetchCommitHistory: tool({
      description: `Fetches the detailed commit history for a specific repository, showing what changes were made and when.
Use this when asked about the development history of a project, what was built over time, commit frequency, or a timeline of a specific repo's progress.`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
        limit: z.number().default(20).describe('Number of commits to return (default 20, max 50)'),
        since: z.string().optional().describe('ISO date string to fetch commits after, e.g. "2025-01-01T00:00:00Z"'),
      }),
      execute: async ({ repo, limit, since }) => {
        try {
          const params: Parameters<typeof client.repos.listCommits>[0] = {
            owner: login,
            repo,
            author: login,
            per_page: Math.min(limit, 50),
          }
          if (since) params.since = since

          const { data: commits } = await client.repos.listCommits(params)

          if (commits.length === 0) {
            return `No commits found for ${repo}${since ? ` since ${since}` : ''}.`
          }

          const lines = commits.map((c) => {
            const date = new Date(c.commit.author?.date ?? '').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
            const sha = c.sha.slice(0, 7)
            return `  [${date}] ${sha}: ${c.commit.message.split('\n')[0]}`
          })

          return `Commit history for ${repo} (${commits.length} commits):\n${lines.join('\n')}`
        } catch (err) {
          return `Could not fetch commit history for "${repo}": ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Single Commit Diff (files changed + patch text)
    // ─────────────────────────────────────────────────────────────────────────
    fetchCommitDiff: tool({
      description: `Fetches the full diff details for a specific commit: every file changed, lines added/removed, and the actual patch/code diff.
Use this to show actual code written in a commit, demonstrate a specific change, or provide a concrete code sample.
Typically chained after fetchCommitHistory — get a SHA from there, then call this.
Use this when asked to "show me the code", "what exactly changed in that commit", or "give me an example of your coding style".`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
        sha: z.string().describe('Commit SHA (full or abbreviated 7-char), obtained from fetchCommitHistory'),
      }),
      execute: async ({ repo, sha }) => {
        try {
          const { data } = await client.repos.getCommit({ owner: login, repo, ref: sha })

          const lines: string[] = [
            `Commit ${data.sha.slice(0, 7)} in ${repo}:`,
            `Author: ${data.commit.author?.name} <${data.commit.author?.email}>`,
            `Date: ${new Date(data.commit.author?.date ?? '').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
            `Message: ${data.commit.message.split('\n')[0]}`,
            `Stats: +${data.stats?.additions ?? 0} additions, -${data.stats?.deletions ?? 0} deletions across ${data.files?.length ?? 0} files`,
            '',
          ]

          for (const file of (data.files ?? []).slice(0, 8)) {
            const icon = file.status === 'added' ? '➕' : file.status === 'removed' ? '➖' : '✏️'
            lines.push(`${icon} ${file.filename} (+${file.additions}/-${file.deletions})`)
            if (file.patch && file.patch.length < 1200) {
              lines.push('```diff')
              lines.push(file.patch)
              lines.push('```')
            } else if (file.patch) {
              lines.push('```diff')
              lines.push(file.patch.slice(0, 1200) + '\n... (truncated)')
              lines.push('```')
            }
          }

          return lines.join('\n')
        } catch (err) {
          return `Could not fetch diff for commit "${sha}" in "${repo}": ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 9. Code Search Across Repositories
    // ─────────────────────────────────────────────────────────────────────────
    searchCode: tool({
      description: `Searches for specific code patterns, function names, library usage, or text across all of Vikram's GitHub repositories.
Use this when asked whether Vikram has implemented a specific feature, uses a particular library/pattern/API, or when looking for specific code that may exist somewhere in his repos.
Examples: "do you have any code that uses Redis?", "have you implemented authentication?", "do you use Docker anywhere?", "where do you use React hooks?"`,
      parameters: z.object({
        query: z.string().describe('Code search query — can be a function name, library name, pattern, or keyword'),
        repo: z.string().optional().describe('Limit search to a specific repo (optional)'),
      }),
      execute: async ({ query, repo }) => {
        try {
          const searchQuery = repo
            ? `${query} repo:${login}/${repo}`
            : `${query} user:${login}`

          const { data } = await client.search.code({
            q: searchQuery,
            per_page: 8,
          })

          if (data.items.length === 0) {
            return `No code matching "${query}" found${repo ? ` in ${repo}` : ' across repositories'}.`
          }

          const lines = [`Code search results for "${query}":`, '']
          for (const item of data.items) {
            lines.push(`📄 ${item.repository.name}/${item.path}`)
            if (item.text_matches && item.text_matches.length > 0) {
              const match = item.text_matches[0]
              if (match.fragment) {
                lines.push(`   ...${match.fragment.slice(0, 200)}...`)
              }
            }
          }

          return lines.join('\n')
        } catch (err) {
          return `Code search failed: ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 9. PR Details (specific PR with full body and review comments)
    // ─────────────────────────────────────────────────────────────────────────
    fetchPRDetails: tool({
      description: `Fetches the full details of a specific pull request, including its description, code changes summary, review comments, and merge status.
Use this when asked about a specific PR by number or title, what changes a PR made, the review process, or to explain the purpose of a particular PR.`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
        pr_number: z.number().describe('Pull request number'),
      }),
      execute: async ({ repo, pr_number }) => {
        try {
          const [pr, files, reviews] = await Promise.allSettled([
            client.pulls.get({ owner: login, repo, pull_number: pr_number }),
            client.pulls.listFiles({ owner: login, repo, pull_number: pr_number, per_page: 10 }),
            client.pulls.listReviews({ owner: login, repo, pull_number: pr_number }),
          ])

          const lines: string[] = []

          if (pr.status === 'fulfilled') {
            const p = pr.value.data
            lines.push(`PR #${p.number}: "${p.title}"`)
            lines.push(`Status: ${p.merged ? 'merged' : p.state}`)
            lines.push(`Author: ${p.user?.login}`)
            lines.push(`Created: ${new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
            if (p.merged_at) lines.push(`Merged: ${new Date(p.merged_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
            lines.push(`Additions: +${p.additions} | Deletions: -${p.deletions} | Files changed: ${p.changed_files}`)
            if (p.body) lines.push(`\nDescription:\n${p.body.slice(0, 800)}`)
          }

          if (files.status === 'fulfilled' && files.value.data.length > 0) {
            lines.push(`\nFiles changed:`)
            for (const f of files.value.data) {
              lines.push(`  ${f.status === 'added' ? '➕' : f.status === 'removed' ? '➖' : '✏️'} ${f.filename} (+${f.additions}/-${f.deletions})`)
            }
          }

          if (reviews.status === 'fulfilled' && reviews.value.data.length > 0) {
            const approved = reviews.value.data.filter((r) => r.state === 'APPROVED')
            if (approved.length > 0) lines.push(`\nApproved by: ${approved.map((r) => r.user?.login).join(', ')}`)
          }

          return lines.join('\n')
        } catch (err) {
          return `Could not fetch PR #${pr_number} in "${repo}": ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 10. GitHub Actions / CI Workflows
    // ─────────────────────────────────────────────────────────────────────────
    fetchWorkflows: tool({
      description: `Fetches the GitHub Actions CI/CD workflows and recent run results for a repository.
Use this when asked whether a project has automated testing/deployment, what the CI/CD setup looks like, build status, or whether tests are passing.`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
      }),
      execute: async ({ repo }) => {
        try {
          const [workflows, runs] = await Promise.allSettled([
            client.actions.listRepoWorkflows({ owner: login, repo }),
            client.actions.listWorkflowRunsForRepo({ owner: login, repo, per_page: 5 }),
          ])

          const lines: string[] = []

          if (workflows.status === 'fulfilled' && workflows.value.data.total_count > 0) {
            lines.push(`GitHub Actions workflows in ${repo}:`)
            for (const wf of workflows.value.data.workflows) {
              lines.push(`  - ${wf.name} (${wf.path})`)
            }
          } else {
            lines.push(`No GitHub Actions workflows found in ${repo}.`)
          }

          if (runs.status === 'fulfilled' && runs.value.data.total_count > 0) {
            lines.push(`\nRecent workflow runs:`)
            for (const run of runs.value.data.workflow_runs.slice(0, 5)) {
              const icon = run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⏳'
              const date = new Date(run.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              lines.push(`  ${icon} [${date}] ${run.name}: ${run.conclusion ?? run.status}`)
            }
          }

          return lines.join('\n')
        } catch (err) {
          return `Could not fetch workflows for "${repo}": ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 11. Releases and Published Versions
    // ─────────────────────────────────────────────────────────────────────────
    fetchReleases: tool({
      description: `Fetches published releases, version tags, and release notes for a repository.
Use this when asked whether a project has been published or shipped, what version it's at, release notes, or the release history of a project.`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
      }),
      execute: async ({ repo }) => {
        try {
          const { data: releases } = await client.repos.listReleases({
            owner: login,
            repo,
            per_page: 5,
          })

          if (releases.length === 0) {
            // Check tags as fallback
            const { data: tags } = await client.repos.listTags({ owner: login, repo, per_page: 5 })
            if (tags.length === 0) {
              return `No releases or version tags found in "${repo}".`
            }
            return `No formal releases in "${repo}", but tags exist: ${tags.map((t) => t.name).join(', ')}`
          }

          const lines = [`Releases for ${repo}:`]
          for (const release of releases) {
            const date = new Date(release.published_at ?? '').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            lines.push(`  - ${release.tag_name} (${date}): ${release.name}`)
            if (release.body) lines.push(`    ${release.body.slice(0, 200)}`)
          }

          return lines.join('\n')
        } catch (err) {
          return `Could not fetch releases for "${repo}": ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 12. Contribution Stats (GraphQL — richer than REST)
    // ─────────────────────────────────────────────────────────────────────────
    fetchContributionStats: tool({
      description: `Fetches Vikram's GitHub contribution statistics: total commits this year, contribution streak, most active days, and weekly activity breakdown.
Use this when asked about overall GitHub activity, how active he is, contribution streak, yearly stats, or coding habits.`,
      parameters: z.object({
        year: z.number().default(new Date().getFullYear()).describe('Year to fetch stats for'),
      }),
      execute: async ({ year }) => {
        try {
          const from = `${year}-01-01T00:00:00Z`
          const to = `${year}-12-31T23:59:59Z`

          const result = await gql<{
            user: {
              contributionsCollection: {
                totalCommitContributions: number
                totalPullRequestContributions: number
                totalIssueContributions: number
                totalRepositoryContributions: number
                contributionCalendar: {
                  totalContributions: number
                  weeks: Array<{
                    firstDay: string
                    contributionDays: Array<{ date: string; contributionCount: number }>
                  }>
                }
              }
            }
          }>(`
            query($login: String!, $from: DateTime!, $to: DateTime!) {
              user(login: $login) {
                contributionsCollection(from: $from, to: $to) {
                  totalCommitContributions
                  totalPullRequestContributions
                  totalIssueContributions
                  totalRepositoryContributions
                  contributionCalendar {
                    totalContributions
                    weeks {
                      firstDay
                      contributionDays {
                        date
                        contributionCount
                      }
                    }
                  }
                }
              }
            }
          `, { login, from, to })

          const cc = result.user.contributionsCollection
          const calendar = cc.contributionCalendar

          // Find most active week and longest streak
          let maxWeekCommits = 0
          let maxWeekStart = ''
          let currentStreak = 0
          let longestStreak = 0
          let activeToday = false

          const today = new Date().toISOString().split('T')[0]

          for (const week of calendar.weeks) {
            const weekTotal = week.contributionDays.reduce((s, d) => s + d.contributionCount, 0)
            if (weekTotal > maxWeekCommits) {
              maxWeekCommits = weekTotal
              maxWeekStart = week.firstDay
            }
            for (const day of week.contributionDays) {
              if (day.contributionCount > 0) {
                currentStreak++
                if (currentStreak > longestStreak) longestStreak = currentStreak
                if (day.date === today) activeToday = true
              } else {
                currentStreak = 0
              }
            }
          }

          return [
            `GitHub contributions for ${year}:`,
            `  Total contributions: ${calendar.totalContributions}`,
            `  Commits: ${cc.totalCommitContributions}`,
            `  Pull requests: ${cc.totalPullRequestContributions}`,
            `  Issues: ${cc.totalIssueContributions}`,
            `  New repositories: ${cc.totalRepositoryContributions}`,
            `  Longest streak: ${longestStreak} days`,
            maxWeekStart ? `  Most active week: ${maxWeekStart} (${maxWeekCommits} contributions)` : '',
            activeToday ? '  Active today ✓' : '',
          ].filter(Boolean).join('\n')
        } catch (err) {
          return `Could not fetch contribution stats: ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 13. Gists
    // ─────────────────────────────────────────────────────────────────────────
    fetchGists: tool({
      description: `Fetches Vikram's public GitHub Gists — standalone code snippets, notes, and scripts he has published.
Use this when asked about code snippets, scripts, notes, or standalone pieces of code outside of full repositories.`,
      parameters: z.object({}),
      execute: async () => {
        try {
          const { data: gists } = await client.gists.list({ per_page: 10 })

          if (gists.length === 0) {
            return 'No public GitHub Gists found.'
          }

          const lines = ['Public GitHub Gists:']
          for (const gist of gists) {
            const files = Object.keys(gist.files ?? {}).join(', ')
            const date = new Date(gist.updated_at ?? '').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            lines.push(`  - [${date}] ${gist.description || files} — Files: ${files}`)
          }

          return lines.join('\n')
        } catch (err) {
          return `Could not fetch gists: ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 14. Pinned / Featured Repositories
    // ─────────────────────────────────────────────────────────────────────────
    fetchPinnedRepos: tool({
      description: `Fetches Vikram's pinned/featured GitHub repositories — the projects he has chosen to highlight on his profile.
Use this when asked what his best or most important projects are, what he showcases, or what his portfolio highlights.`,
      parameters: z.object({}),
      execute: async () => {
        try {
          const result = await gql<{
            user: {
              pinnedItems: {
                nodes: Array<{
                  name: string
                  description: string | null
                  url: string
                  primaryLanguage: { name: string } | null
                  stargazerCount: number
                  updatedAt: string
                }>
              }
            }
          }>(`
            query($login: String!) {
              user(login: $login) {
                pinnedItems(first: 6, types: REPOSITORY) {
                  nodes {
                    ... on Repository {
                      name
                      description
                      url
                      primaryLanguage { name }
                      stargazerCount
                      updatedAt
                    }
                  }
                }
              }
            }
          `, { login })

          const pinned = result.user.pinnedItems.nodes
          if (pinned.length === 0) {
            return 'No pinned repositories found on the GitHub profile.'
          }

          const lines = ['Pinned/featured repositories on GitHub profile:']
          for (const repo of pinned) {
            const lang = repo.primaryLanguage?.name ?? 'unknown'
            const date = new Date(repo.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            lines.push(`  - ${repo.name} (${lang}, updated ${date})${repo.description ? `: ${repo.description}` : ''}`)
          }

          return lines.join('\n')
        } catch (err) {
          return `Could not fetch pinned repos: ${String(err)}`
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // 15. Repository Insights / Traffic
    // ─────────────────────────────────────────────────────────────────────────
    fetchRepoInsights: tool({
      description: `Fetches view counts, clone stats, and referrer traffic for a repository. Shows how much attention a project is getting.
Use this when asked about how popular a project is, how many people view it, traffic stats, or how much interest a repo gets.`,
      parameters: z.object({
        repo: z.string().describe('Repository name'),
      }),
      execute: async ({ repo }) => {
        try {
          const [views, clones, referrers] = await Promise.allSettled([
            client.repos.getViews({ owner: login, repo }),
            client.repos.getClones({ owner: login, repo }),
            client.repos.getTopReferrers({ owner: login, repo }),
          ])

          const lines: string[] = [`Traffic insights for ${repo}:`]

          if (views.status === 'fulfilled') {
            lines.push(`  Views (last 14 days): ${views.value.data.count} total, ${views.value.data.uniques} unique`)
          }
          if (clones.status === 'fulfilled') {
            lines.push(`  Clones (last 14 days): ${clones.value.data.count} total, ${clones.value.data.uniques} unique`)
          }
          if (referrers.status === 'fulfilled' && referrers.value.data.length > 0) {
            lines.push(`  Top referrers: ${referrers.value.data.slice(0, 5).map((r) => `${r.referrer} (${r.count})`).join(', ')}`)
          }

          return lines.join('\n')
        } catch (err) {
          return `Could not fetch insights for "${repo}" (may need push access): ${String(err)}`
        }
      },
    }),
  }
}
