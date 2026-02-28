import { z } from 'zod'

const envSchema = z.object({
  AUTH_GITHUB_ID: z.string().min(1, 'GitHub OAuth Client ID is required'),
  AUTH_GITHUB_SECRET: z.string().min(1, 'GitHub OAuth Client Secret is required'),
  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32'),
  OPENAI_API_KEY: z.string().startsWith('sk-', 'OpenAI API key must start with sk-'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
})

function parseEnv() {
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors
    const messages = Object.entries(errors)
      .map(([field, msgs]) => `  • ${field}: ${msgs?.join(', ')}`)
      .join('\n')
    throw new Error(
      `\n\n❌ Environment variable validation failed:\n${messages}\n\n` +
        `  → Copy .env.example to .env.local and fill in the required values.\n`,
    )
  }
  return result.data
}

export const env = parseEnv()

export type Env = z.infer<typeof envSchema>
