import fs from 'fs/promises'
import path from 'path'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { retrieveContext } from '@/lib/rag/retriever'
import { buildSystemPrompt } from '@/lib/rag/prompts'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env.local' })

const DATASET_PATH = path.join(process.cwd(), 'scripts/evaluation-dataset.json')

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

async function evaluate() {
  console.log('Starting RAG Evaluation...')
  
  const rawDataset = await fs.readFile(DATASET_PATH, 'utf-8')
  const dataset = JSON.parse(rawDataset)
  
  const results = []
  
  for (const item of dataset) {
    console.log(`\nEvaluating question: "${item.question}"`)
    
    try {
      // 1. Retrieve Context
      const retrievalStart = Date.now()
      const context = await retrieveContext(item.question)
      const retrievalTime = Date.now() - retrievalStart
      
      // 2. Generate Answer
      const systemPrompt = buildSystemPrompt('Vikram', context.contextText)
      const { text: answer } = await generateText({
        model: openai('gpt-4o'),
        system: systemPrompt,
        messages: [{ role: 'user', content: item.question }],
        maxTokens: 500,
      })
      
      console.log(`  Retrieval Time: ${retrievalTime}ms`)
      console.log(`  Context Chunks: ${context.chunks.length}`)
      // console.log(`  Answer: ${answer.slice(0, 100)}...`)
      
      // 3. LLM Judge Evaluation
      const judgePrompt = `
      You are an impartial judge evaluating the quality of a RAG-based AI assistant's response.
      Current Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      
      User Question: "${item.question}"
      Provided Context:
      ${context.contextText.slice(0, 2000)}... (truncated)
      
      AI Answer: "${answer}"
      
      Evaluation Criteria: "${item.criteria}"
      Expected Keywords: ${item.expected_answer_keywords.join(', ')}
      
      Task:
      Rate the answer on a scale of 1 to 5 based on:
      - Groundedness (Is the answer supported by the context?)
      - Relevance (Does it answer the question?)
      - Completeness (Does it cover key details?)
      
      Output strictly in JSON format:
      {
        "score": number,
        "reasoning": string
      }
      `
      
      const { text: evaluationRaw } = await generateText({
        model: openai('gpt-4o'),
        prompt: judgePrompt,
        maxTokens: 300,
      })
      
      let evaluation
      try {
        // Simple extraction of JSON
        const jsonMatch = evaluationRaw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          evaluation = JSON.parse(jsonMatch[0])
        } else {
            evaluation = { score: 0, reasoning: "Failed to parse evaluation JSON" }
        }
      } catch (e) {
        evaluation = { score: 0, reasoning: "Failed to parse evaluation JSON" }
      }
      
      console.log(`  Score: ${evaluation.score}/5`)
      console.log(`  Reasoning: ${evaluation.reasoning}`)
      
      results.push({
        question: item.question,
        answer,
        score: evaluation.score,
        reasoning: evaluation.reasoning,
        retrievalTime,
        chunksFound: context.chunks.length
      })
      
    } catch (err) {
      console.error(`  Error evaluating question: ${item.question}`, err)
      results.push({
        question: item.question,
        error: String(err),
        score: 0
      })
    }
  }
  
  // Summary
  const avgScore = results.reduce((acc, r) => acc + (r.score || 0), 0) / results.length
  console.log(`\nEvaluation Complete. Average Score: ${avgScore.toFixed(2)}/5`)
  
  await fs.writeFile('evaluation-results.json', JSON.stringify(results, null, 2))
  console.log('Detailed results saved to evaluation-results.json')
}

evaluate().catch(console.error)
