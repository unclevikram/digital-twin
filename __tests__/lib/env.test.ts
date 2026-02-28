import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// Re-create the schema here to test it in isolation
// (importing src/lib/env.ts would trigger the actual parse with test env vars)
const envSchema = z.object({
  AUTH_GITHUB_ID: z.string().min(1, 'GitHub OAuth Client ID is required'),
  AUTH_GITHUB_SECRET: z.string().min(1, 'GitHub OAuth Client Secret is required'),
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters'),
  OPENAI_API_KEY: z.string().startsWith('sk-', 'OpenAI API key must start with sk-'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
})

const validEnv = {
  AUTH_GITHUB_ID: 'github-client-id-123',
  AUTH_GITHUB_SECRET: 'github-client-secret-456',
  AUTH_SECRET: 'this-is-a-valid-secret-that-is-at-least-32-chars',
  OPENAI_API_KEY: 'sk-valid-openai-api-key',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
}

describe('env validation schema', () => {
  it('passes validation with valid environment variables', () => {
    const result = envSchema.safeParse(validEnv)
    expect(result.success).toBe(true)
  })

  it('fails when AUTH_GITHUB_ID is missing', () => {
    const result = envSchema.safeParse({ ...validEnv, AUTH_GITHUB_ID: '' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors
      expect(errors.AUTH_GITHUB_ID).toBeDefined()
    }
  })

  it('fails when AUTH_SECRET is too short (< 32 chars)', () => {
    const result = envSchema.safeParse({ ...validEnv, AUTH_SECRET: 'too-short' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors
      expect(errors.AUTH_SECRET).toBeDefined()
      expect(errors.AUTH_SECRET?.[0]).toContain('32')
    }
  })

  it('fails when OPENAI_API_KEY does not start with sk-', () => {
    const result = envSchema.safeParse({ ...validEnv, OPENAI_API_KEY: 'invalid-key' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors
      expect(errors.OPENAI_API_KEY).toBeDefined()
      expect(errors.OPENAI_API_KEY?.[0]).toContain('sk-')
    }
  })

  it('uses default URL when NEXT_PUBLIC_APP_URL is not set', () => {
    const { NEXT_PUBLIC_APP_URL: _, ...withoutUrl } = validEnv
    const result = envSchema.safeParse(withoutUrl)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_APP_URL).toBe('http://localhost:3000')
    }
  })

  it('fails when NEXT_PUBLIC_APP_URL is not a valid URL', () => {
    const result = envSchema.safeParse({ ...validEnv, NEXT_PUBLIC_APP_URL: 'not-a-url' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors
      expect(errors.NEXT_PUBLIC_APP_URL).toBeDefined()
    }
  })

  it('fails when AUTH_GITHUB_SECRET is missing', () => {
    const result = envSchema.safeParse({ ...validEnv, AUTH_GITHUB_SECRET: '' })
    expect(result.success).toBe(false)
  })

  it('accepts AUTH_SECRET with exactly 32 characters', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      AUTH_SECRET: 'exactly-32-characters-right-here',
    })
    expect(result.success).toBe(true)
  })

  it('provides descriptive error messages for multiple failures', () => {
    const result = envSchema.safeParse({
      AUTH_GITHUB_ID: '',
      AUTH_GITHUB_SECRET: '',
      AUTH_SECRET: 'short',
      OPENAI_API_KEY: 'wrong-prefix',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors
      // Multiple fields should have errors
      expect(Object.keys(errors).length).toBeGreaterThan(2)
    }
  })
})
