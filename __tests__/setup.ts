import { vi } from 'vitest'

// Mock environment variables for tests
process.env.AUTH_GITHUB_ID = 'test-github-id'
process.env.AUTH_GITHUB_SECRET = 'test-github-secret'
process.env.AUTH_SECRET = 'test-auth-secret-that-is-at-least-32-chars-long'
process.env.OPENAI_API_KEY = 'sk-test-openai-key-for-testing-purposes'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

// Suppress console.log/warn during tests unless there's an error
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
