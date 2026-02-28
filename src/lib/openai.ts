import { createOpenAI } from '@ai-sdk/openai'

let _openaiClient: ReturnType<typeof createOpenAI> | null = null

/**
 * Returns a singleton OpenAI client configured with the environment API key.
 */
export function getOpenAIClient() {
  if (!_openaiClient) {
    _openaiClient = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    })
  }
  return _openaiClient
}

export const openaiModel = (modelId: string) => getOpenAIClient()(modelId)
