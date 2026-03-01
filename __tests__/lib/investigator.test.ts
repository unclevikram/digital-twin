import { describe, it, expect, vi, beforeEach } from 'vitest'
import { investigateFeature } from '@/lib/github/investigator'

describe('investigateFeature', () => {
  const mockClient = {
    repos: {
      get: vi.fn(),
      getBranch: vi.fn(),
      getContent: vi.fn(),
    },
    git: {
      getTree: vi.fn(),
    },
    search: {
      code: vi.fn(),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default mocks
    mockClient.repos.get.mockResolvedValue({ data: { default_branch: 'main' } })
    mockClient.repos.getBranch.mockResolvedValue({ 
      data: { commit: { commit: { tree: { sha: 'tree-sha' } } } } 
    })
    mockClient.git.getTree.mockResolvedValue({ 
      data: { 
        tree: [
          { path: 'src/components/Map.tsx', type: 'blob' },
          { path: 'src/utils/geo.ts', type: 'blob' },
          { path: 'README.md', type: 'blob' },
        ] 
      } 
    })
    mockClient.search.code.mockResolvedValue({ data: { items: [] } })
    mockClient.repos.getContent.mockResolvedValue({ 
      data: { 
        encoding: 'base64', 
        content: Buffer.from('console.log("map initialized")').toString('base64') 
      } 
    })
  })

  it('investigates a feature by scanning tree and searching code', async () => {
    const result = await investigateFeature(
      mockClient as any,
      'user',
      'repo',
      'map view',
      5
    )

    expect(result).toContain('Feature investigation for "map view"')
    expect(result).toContain('src/components/Map.tsx') // Should find this file
    
    // Should have called tree scan
    expect(mockClient.git.getTree).toHaveBeenCalled()
    
    // Should have searched for terms
    expect(mockClient.search.code).toHaveBeenCalled()
  })

  it('handles search hits', async () => {
    mockClient.search.code.mockResolvedValue({ 
      data: { 
        items: [{ path: 'src/features/Map/index.ts', repository: { name: 'repo' } }] 
      } 
    })

    const result = await investigateFeature(
      mockClient as any,
      'user',
      'repo',
      'map',
      5
    )

    expect(result).toContain('src/features/Map/index.ts')
    expect(result).toContain('matched 1 files')
  })

  it('handles file read errors gracefully', async () => {
    mockClient.repos.getContent.mockRejectedValue(new Error('Failed to read'))

    const result = await investigateFeature(
      mockClient as any,
      'user',
      'repo',
      'map',
      5
    )

    expect(result).toContain('couldn\'t fetch readable file contents')
  })

  it('returns appropriate message when no candidates found', async () => {
    // Empty tree, no search results
    mockClient.git.getTree.mockResolvedValue({ data: { tree: [] } })
    mockClient.search.code.mockResolvedValue({ data: { items: [] } })

    const result = await investigateFeature(
      mockClient as any,
      'user',
      'repo',
      'nonexistentfeature',
      5
    )

    expect(result).toContain("couldn't find implementation evidence")
  })
})
