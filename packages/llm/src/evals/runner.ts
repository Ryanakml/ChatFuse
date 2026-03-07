import { ChatOpenAI } from '@langchain/openai';
import { EVAL_DATASET } from './dataset.js';
import { processMessagePipeline } from '../langchain/pipeline.js';
import type { AgentState } from '../langchain/types.js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env vars
dotenv.config({ path: resolve(process.cwd(), '.env') });

async function runEvals() {
  console.log('Starting RAG Quality Evaluation...');

  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0,
  });

  let totalPrecision = 0;
  let totalFaithfulness = 0;

  for (const testCase of EVAL_DATASET) {
    console.log(`\nEvaluating: "${testCase.question}"`);

    const initialState: AgentState = {
      originalInput: testCase.question,
      context: {
        userId: 'eval-user',
        conversationId: 'eval-session',
        history: [],
      },
    };

    try {
      // Run the pipeline
      const state = await processMessagePipeline.invoke(initialState);

      const retrievedContext = state.retrievedContext || '';
      const answer = state.finalResponse || '';

      // 1. Evaluate Precision (Did we retrieve chunks containing expected keywords?)
      const contextLower = retrievedContext.toLowerCase();
      const matchedKeywords = testCase.expectedContextKeywords.filter((kw) =>
        contextLower.includes(kw.toLowerCase()),
      );

      const precisionScore =
        testCase.expectedContextKeywords.length > 0
          ? matchedKeywords.length / testCase.expectedContextKeywords.length
          : 1.0;

      totalPrecision += precisionScore;
      console.log(
        `- Precision Score: ${(precisionScore * 100).toFixed(0)}% (${matchedKeywords.length}/${testCase.expectedContextKeywords.length} keywords)`,
      );

      // 2. Evaluate Faithfulness (LLM-as-a-judge check)
      const faithfulnessPrompt = `
You are an expert evaluator. Evaluate if the ANSWER is strictly faithful to and grounded by the CONTEXT.
If the ANSWER contains claims unsupported by the CONTEXT, it is unfaithful.

CONTEXT:
${retrievedContext}

ANSWER:
${answer}

Is the answer strictly faithful to the context? Reply exact ONLY with "YES" or "NO".
`;
      const judgeRes = await llm.invoke(faithfulnessPrompt);
      const isFaithful = judgeRes.content.toString().trim().toUpperCase() === 'YES';
      const faithfulnessScore = isFaithful ? 1 : 0;

      totalFaithfulness += faithfulnessScore;
      console.log(`- Faithfulness Score: ${faithfulnessScore * 100}%`);
      console.log(`  -> Context length: ${retrievedContext.length}`);
      console.log(`  -> Final Answer: ${answer.substring(0, 100)}...`);
    } catch (err: unknown) {
      console.error(
        `- Error during evaluation pipeline: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const avgPrecision = totalPrecision / EVAL_DATASET.length;
  const avgFaithfulness = totalFaithfulness / EVAL_DATASET.length;

  console.log('\n--- Final Evaluation Results ---');
  console.log(`Average Precision: ${(avgPrecision * 100).toFixed(1)}%`);
  console.log(`Average Faithfulness: ${(avgFaithfulness * 100).toFixed(1)}%`);

  // Define thresholds
  const PRECISION_THRESHOLD = 0.8;
  const FAITHFULNESS_THRESHOLD = 0.95;

  let failed = false;

  if (avgPrecision < PRECISION_THRESHOLD) {
    console.error(`❌ Precision failed! ${avgPrecision} < ${PRECISION_THRESHOLD}`);
    failed = true;
  }
  if (avgFaithfulness < FAITHFULNESS_THRESHOLD) {
    console.error(`❌ Faithfulness failed! ${avgFaithfulness} < ${FAITHFULNESS_THRESHOLD}`);
    failed = true;
  }

  if (failed) {
    console.error(`\nRAG Pipeline failed quality gates. Exiting with error.`);
    process.exit(1);
  } else {
    console.log(`\n✅ RAG Pipeline passed all quality gates.`);
    process.exit(0);
  }
}

runEvals().catch((err) => {
  console.error('Fatal error during evaluation:', err);
  process.exit(1);
});
