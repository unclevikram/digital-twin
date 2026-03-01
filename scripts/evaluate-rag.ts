import fs from 'fs/promises'
import path from 'path'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { retrieveContext } from '@/lib/rag/retriever'
import { buildSystemPrompt } from '@/lib/rag/prompts'
import { config } from 'dotenv'
import { z } from 'zod'

// Load environment variables
config({ path: '.env.local' })

const DATASET_PATH = path.join(process.cwd(), 'scripts/evaluation-dataset.json')
const OUTPUT_PATH = path.join(process.cwd(), 'evaluation-results.json')
const NOW = new Date().toISOString()

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

const sourceConstraintSchema = z.object({
  source: z.enum(['github', 'notion']).optional(),
  repo: z.string().optional(),
  type: z.string().optional(),
  titleIncludes: z.string().optional(),
})

const evalCaseSchema = z.object({
  id: z.string(),
  question: z.string(),
  intent: z.string(),
  requiredSources: z.array(sourceConstraintSchema).default([]),
  mustMention: z.array(z.string()).default([]),
  forbiddenClaims: z.array(z.string()).default([]),
  notes: z.string().optional(),
})

const evalDatasetSchema = z.array(evalCaseSchema)

type EvalCase = z.infer<typeof evalCaseSchema>

interface RetrievalMetrics {
  requiredSourceCount: number
  matchedRequiredSources: number
  recallAtK: number
  sourceDiversity: number
  topScore: number
  confidenceScore: number
}

interface AnswerMetrics {
  citationCount: number
  mustMentionCoverage: number
  forbiddenClaimHits: number
}

interface JudgeMetrics {
  groundedness: number
  relevance: number
  completeness: number
  citationAccuracy: number
  reasoning: string
}

interface EvalResult {
  id: string
  question: string
  answer: string
  retrievalTimeMs: number
  retrievalMetrics: RetrievalMetrics
  answerMetrics: AnswerMetrics
  judgeMetrics: JudgeMetrics
  finalScore: number
}

async function evaluate() {
  console.log('Starting RAG Evaluation...')

  const rawDataset = await fs.readFile(DATASET_PATH, 'utf-8')
  const parsedDataset = evalDatasetSchema.safeParse(JSON.parse(rawDataset))
  if (!parsedDataset.success) {
    throw new Error(`Invalid dataset schema: ${parsedDataset.error.message}`)
  }
  const dataset = parsedDataset.data

  const results: EvalResult[] = []

  for (const item of dataset) {
    console.log(`\nEvaluating [${item.id}] "${item.question}"`)

    try {
      // 1. Retrieve Context
      const retrievalStart = Date.now()
      const context = await retrieveContext(item.question, { topK: 10, minScore: 0.25 })
      const retrievalTime = Date.now() - retrievalStart

      const retrievalMetrics = computeRetrievalMetrics(item, context.sources, context.debugInfo)

      // 2. Generate Answer
      const systemPrompt = buildSystemPrompt('Vikram', context.contextText)
      const { text: answer } = await generateText({
        model: openai('gpt-4o'),
        system: systemPrompt,
        messages: [{ role: 'user', content: item.question }],
        maxTokens: 500,
      })

      const answerMetrics = computeAnswerMetrics(item, answer)

      console.log(`  Retrieval Time: ${retrievalTime}ms`)
      console.log(
        `  Retrieval: recall@k=${retrievalMetrics.recallAtK.toFixed(2)}, diversity=${retrievalMetrics.sourceDiversity}, topScore=${retrievalMetrics.topScore.toFixed(3)}`,
      )
      console.log(
        `  Answer: citations=${answerMetrics.citationCount}, mustMentionCoverage=${answerMetrics.mustMentionCoverage.toFixed(2)}`,
      )

      // 3. LLM Judge Evaluation (structured rubric)
      const judgePrompt = `
You are an impartial judge evaluating a RAG assistant.
Current Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Case:
- id: ${item.id}
- intent: ${item.intent}
- question: "${item.question}"

Retrieved context excerpt:
${context.contextText.slice(0, 2500)}${context.contextText.length > 2500 ? '... (truncated)' : ''}

Assistant answer:
"${answer}"

Evaluate each category from 1-5:
- groundedness: Is answer supported by retrieved evidence?
- relevance: Does it answer the user question directly?
- completeness: Does it cover the expected core details?
- citationAccuracy: Are source citations [S#] used correctly and meaningfully?

Return strict JSON:
{
  "groundedness": number,
  "relevance": number,
  "completeness": number,
  "citationAccuracy": number,
  "reasoning": string
}
      `

      const { text: evaluationRaw } = await generateText({
        model: openai('gpt-4o'),
        prompt: judgePrompt,
        maxTokens: 300,
      })

      let judgeMetrics: JudgeMetrics
      try {
        const jsonMatch = evaluationRaw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as JudgeMetrics
          judgeMetrics = {
            groundedness: clampMetric(parsed.groundedness),
            relevance: clampMetric(parsed.relevance),
            completeness: clampMetric(parsed.completeness),
            citationAccuracy: clampMetric(parsed.citationAccuracy),
            reasoning: parsed.reasoning ?? '',
          }
        } else {
          judgeMetrics = {
            groundedness: 1,
            relevance: 1,
            completeness: 1,
            citationAccuracy: 1,
            reasoning: 'Failed to parse evaluation JSON',
          }
        }
      } catch {
        judgeMetrics = {
          groundedness: 1,
          relevance: 1,
          completeness: 1,
          citationAccuracy: 1,
          reasoning: 'Failed to parse evaluation JSON',
        }
      }

      const finalScore = computeFinalScore(retrievalMetrics, answerMetrics, judgeMetrics)

      console.log(
        `  Judge: grounded=${judgeMetrics.groundedness}/5 relevance=${judgeMetrics.relevance}/5 completeness=${judgeMetrics.completeness}/5 citation=${judgeMetrics.citationAccuracy}/5`,
      )
      console.log(`  Final Score: ${finalScore.toFixed(2)}/5`)

      results.push({
        id: item.id,
        question: item.question,
        answer,
        retrievalTimeMs: retrievalTime,
        retrievalMetrics,
        answerMetrics,
        judgeMetrics,
        finalScore,
      })
    } catch (err) {
      console.error(`  Error evaluating question: ${item.question}`, err)
    }
  }

  const summary = {
    generatedAt: NOW,
    totalCases: results.length,
    averageFinalScore:
      results.reduce((acc, result) => acc + result.finalScore, 0) / Math.max(results.length, 1),
    averageRetrievalRecall:
      results.reduce((acc, result) => acc + result.retrievalMetrics.recallAtK, 0) /
      Math.max(results.length, 1),
    averageCitationCount:
      results.reduce((acc, result) => acc + result.answerMetrics.citationCount, 0) /
      Math.max(results.length, 1),
  }

  console.log(`\nEvaluation Complete. Average Score: ${summary.averageFinalScore.toFixed(2)}/5`)
  console.log(`Average Recall@K: ${summary.averageRetrievalRecall.toFixed(2)}`)
  console.log(`Average Citation Count: ${summary.averageCitationCount.toFixed(2)}`)

  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        summary,
        results,
      },
      null,
      2,
    ),
  )
  console.log(`Detailed results saved to ${OUTPUT_PATH}`)
}

evaluate().catch(console.error)

function sourceMatchesConstraint(
  source: {
    source: 'github' | 'notion'
    repo?: string
    type: string
    title?: string
  },
  constraint: z.infer<typeof sourceConstraintSchema>,
): boolean {
  if (constraint.source && source.source !== constraint.source) return false
  if (constraint.repo && source.repo !== constraint.repo) return false
  if (constraint.type && source.type !== constraint.type) return false
  if (constraint.titleIncludes && !source.title?.toLowerCase().includes(constraint.titleIncludes.toLowerCase())) {
    return false
  }
  return true
}

function computeRetrievalMetrics(
  item: EvalCase,
  sources: Array<{
    source: 'github' | 'notion'
    repo?: string
    type: string
    title?: string
  }>,
  debugInfo: {
    topScores: number[]
    confidence: { score: number }
  },
): RetrievalMetrics {
  const required = item.requiredSources.length
  const matched = item.requiredSources.filter((constraint) =>
    sources.some((source) => sourceMatchesConstraint(source, constraint)),
  ).length

  const uniqueSourceKeys = new Set(
    sources.map((source) => `${source.source}:${source.repo ?? source.title ?? source.type}`),
  )

  return {
    requiredSourceCount: required,
    matchedRequiredSources: matched,
    recallAtK: required === 0 ? 1 : matched / required,
    sourceDiversity: uniqueSourceKeys.size,
    topScore: debugInfo.topScores[0] ?? 0,
    confidenceScore: debugInfo.confidence.score ?? 0,
  }
}

function computeAnswerMetrics(item: EvalCase, answer: string): AnswerMetrics {
  const normalizedAnswer = answer.toLowerCase()
  const citations = answer.match(/\[S\d+\]/g) ?? []
  const mustMentionHits = item.mustMention.filter((term) =>
    normalizedAnswer.includes(term.toLowerCase()),
  ).length
  const forbiddenHits = item.forbiddenClaims.filter((term) =>
    normalizedAnswer.includes(term.toLowerCase()),
  ).length

  return {
    citationCount: citations.length,
    mustMentionCoverage:
      item.mustMention.length === 0 ? 1 : mustMentionHits / item.mustMention.length,
    forbiddenClaimHits: forbiddenHits,
  }
}

function computeFinalScore(
  retrieval: RetrievalMetrics,
  answer: AnswerMetrics,
  judge: JudgeMetrics,
): number {
  const judgeAvg =
    (judge.groundedness + judge.relevance + judge.completeness + judge.citationAccuracy) / 4

  // Normalize deterministic metrics to 1-5 scale and blend with judge signal.
  const retrievalScore = 1 + 4 * ((retrieval.recallAtK * 0.7) + (Math.min(retrieval.sourceDiversity, 4) / 4) * 0.3)
  const answerScore =
    1 +
    4 *
      (Math.min(answer.citationCount, 5) / 5 * 0.6 +
        answer.mustMentionCoverage * 0.4 -
        Math.min(answer.forbiddenClaimHits, 2) * 0.2)

  return (
    judgeAvg * 0.6 +
    clampToScale(retrievalScore) * 0.25 +
    clampToScale(answerScore) * 0.15
  )
}

function clampMetric(value: number): number {
  return clampToScale(Number.isFinite(value) ? value : 1)
}

function clampToScale(value: number): number {
  return Math.max(1, Math.min(5, value))
}
