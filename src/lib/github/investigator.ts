import type { Octokit } from '@octokit/rest'

export async function investigateFeature(
  client: Octokit,
  login: string,
  repo: string,
  feature: string,
  maxFiles: number
): Promise<string> {
  const safeMaxFiles = Math.max(3, Math.min(maxFiles, 10))
  try {
    const featureTerms = Array.from(
      new Set(
        feature
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3),
      ),
    )
    const expandedTerms = new Set(featureTerms)
    if (featureTerms.some((t) => ['map', 'maps', 'mapping', 'geo', 'location'].includes(t))) {
      ;['map', 'maps', 'mapbox', 'leaflet', 'google', 'marker', 'lat', 'lng', 'viewport'].forEach(
        (t) => expandedTerms.add(t),
      )
    }

    // 1) Repo tree scan
    const { data: repoData } = await client.repos.get({ owner: login, repo })
    const branch = repoData.default_branch
    const { data: branchData } = await client.repos.getBranch({ owner: login, repo, branch })
    const treeSha = branchData.commit.commit.tree.sha
    const { data: tree } = await client.git.getTree({
      owner: login,
      repo,
      tree_sha: treeSha,
      recursive: '1',
    })

    const treeFiles = (tree.tree ?? []).filter((n) => n.type === 'blob' && !!n.path)
    const scoredByPath = treeFiles
      .map((node) => {
        const path = (node.path ?? '').toLowerCase()
        let score = 0
        for (const term of Array.from(expandedTerms)) {
          if (path.includes(term)) score += 2
        }
        if (/src|app|components|features|hooks|services|lib/.test(path)) score += 1
        if (/test|spec|stories/.test(path)) score -= 1
        return { path: node.path as string, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)

    // 2) Code search with multiple terms
    const searchedPaths = new Set<string>()
    const searchEvidence: string[] = []
    for (const term of Array.from(expandedTerms).slice(0, 6)) {
      try {
        const { data } = await client.search.code({
          q: `${term} repo:${login}/${repo}`,
          per_page: 8,
        })
        for (const item of data.items) {
          searchedPaths.add(item.path)
        }
        if (data.items.length > 0) {
          searchEvidence.push(`- term "${term}" matched ${data.items.length} files`)
        }
      } catch {
        // Continue even if one search term fails
      }
    }

    // 3) Merge candidates (search hits first, then tree scores)
    const candidatePaths: string[] = [
      ...Array.from(searchedPaths),
      ...scoredByPath.map((item) => item.path),
    ]
    const uniqueCandidates = Array.from(new Set(candidatePaths)).slice(0, safeMaxFiles)

    if (uniqueCandidates.length === 0) {
      return `I couldn't find implementation evidence for "${feature}" in ${repo} after scanning the repo tree and running multi-term code search.
Try a different feature name, or ask me to inspect a specific folder/file path in that repo.`
    }

    // 4) Read top files and extract relevant snippets
    const fileSummaries: string[] = []
    for (const filePath of uniqueCandidates) {
      try {
        const { data } = await client.repos.getContent({ owner: login, repo, path: filePath })
        if (Array.isArray(data) || !('content' in data) || data.encoding !== 'base64') continue

        const content = Buffer.from(data.content, 'base64').toString('utf-8')
        const lines = content.split('\n')
        const matches: string[] = []
        for (const line of lines) {
          const lower = line.toLowerCase()
          if (Array.from(expandedTerms).some((term) => lower.includes(term))) {
            const normalized = line.trim()
            if (normalized.length > 0) matches.push(normalized)
          }
          if (matches.length >= 4) break
        }

        const snippet =
          matches.length > 0
            ? matches.map((m) => `    • ${m.slice(0, 180)}`).join('\n')
            : `    • ${content.slice(0, 220).replace(/\s+/g, ' ')}...`

        fileSummaries.push(`- ${filePath}\n${snippet}`)
      } catch {
        // Ignore file read failures
      }
    }

    if (fileSummaries.length === 0) {
      return `I found candidate files for "${feature}" in ${repo}, but couldn't fetch readable file contents.
Top candidates: ${uniqueCandidates.join(', ')}`
    }

    return [
      `Feature investigation for "${feature}" in ${repo}:`,
      '',
      'Search evidence:',
      ...(searchEvidence.length > 0 ? searchEvidence : ['- No direct code-search hits; relying on path-based candidate ranking']),
      '',
      'Likely implementation files and evidence snippets:',
      ...fileSummaries,
      '',
      'Use these files to explain architecture, data flow, and implementation details with citations.',
    ].join('\n')
  } catch (err) {
    return `Could not investigate feature "${feature}" in "${repo}": ${String(err)}`
  }
}
