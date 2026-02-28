import OpenAI from 'openai'

let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  }
  return _client
}

/**
 * Generates 1 alternative phrasing of the user's question.
 *
 * Why: Different wording hits different vocabulary in the vector index.
 * "What complex systems have you built?" and "Describe your most sophisticated projects"
 * embed differently and retrieve different (complementary) chunks.
 *
 * We generate a REPHRASING — not a new topic — so results stay on-target.
 * Uses gpt-4o-mini (fast, cheap) since this is just reformulation.
 */
export async function expandQuery(query: string): Promise<string[]> {
  // Very short queries are already specific — no need to expand
  if (query.trim().split(/\s+/).length < 4) return []

  try {
    const response = await getClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `Rephrase the following question in a different way that asks for the same information but uses different vocabulary. Return ONLY the rephrased question, nothing else.

Question: "${query}"`,
        },
      ],
      max_tokens: 60,
      temperature: 0.3,
    })

    const rephrased = response.choices[0]?.message.content?.trim().replace(/^["']|["']$/g, '') ?? ''
    return rephrased.length > 5 ? [rephrased] : []
  } catch {
    // Non-critical — fall back to single query search
    return []
  }
}
