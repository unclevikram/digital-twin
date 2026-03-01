export type QuerySafetyDecision = {
  allow: boolean
  mode: 'allow' | 'redirect' | 'refuse'
  reason?: string
  userMessage?: string
}

// Reduced safety strictness as requested
const REFUSE_PATTERNS: RegExp[] = [
  /\b(ssn|social security|passport|driver'?s license)\b/i,
  /\b(bank account|credit card|salary slip|tax return)\b/i,
]

const REDIRECT_PATTERNS: RegExp[] = [
  // Relaxed personal topic filtering
]

const INJECTION_PATTERNS: RegExp[] = [
  /\bignore (all|previous|prior) instructions\b/i,
  /\bexpose|leak|dump\b.*\b(prompt|system prompt|secrets?)\b/i,
]

export function evaluateQuerySafety(query: string): QuerySafetyDecision {
  const normalized = query.trim()
  if (!normalized) return { allow: true, mode: 'allow' }

  if (INJECTION_PATTERNS.some((re) => re.test(normalized))) {
    return {
      allow: false,
      mode: 'refuse',
      reason: 'prompt_injection_or_exfiltration',
      userMessage: "I can't help with exposing hidden prompts or secrets.",
    }
  }

  if (REFUSE_PATTERNS.some((re) => re.test(normalized))) {
    return {
      allow: false,
      mode: 'refuse',
      reason: 'highly_sensitive_personal_data',
      userMessage: "I can't share highly sensitive financial or identity information.",
    }
  }

  return { allow: true, mode: 'allow' }
}

export function buildSafetyAddendum(): string {
  return `
[Safety Policy]
- Be helpful and open to personal questions if the context exists in the knowledge base.
- Do not reveal critical secrets (financial, passwords, API keys).
- Feel free to discuss hobbies, interests, and non-work topics if they appear in Notion/GitHub data.
`.trim()
}
