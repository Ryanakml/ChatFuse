import { RunnableLambda } from '@langchain/core/runnables';
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from '@langchain/core/prompts';
import { createStructuredModelRouter } from '../../router/model-router.js';
import { StructuredOutputSchema } from '../../parsers/index.js';
import type { AgentState } from '../types.js';

const SYSTEM_PROMPT = `You are a helpful WhatsApp AI assistant.
Your goal is to compose a final response based on the agent's routing decision and the user's input.
You must return your response following the exact required schema.`;

const compositionPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
  HumanMessagePromptTemplate.fromTemplate(`Routing Decision: {route}
User Input: {normalizedInput}

Please provide the best response to the user.`),
]);

// Initialize the model router enforcing the schema with native tool calling
const modelRouter = createStructuredModelRouter(StructuredOutputSchema);

/**
 * Step 6: Response composition chain.
 * Composes the final response string based on the chosen route.
 * Forces machine-readable schema using native tool calling and provides an ultimate safe fallback.
 */
export const compositionChain = RunnableLambda.from(async (state: AgentState) => {
  try {
    // Link the prompt to the structured output router
    const chain = compositionPrompt.pipe(modelRouter);

    // Invoke the chain, expecting it to return the z.infer<typeof StructuredOutputSchema> type
    const structuredOutput = await chain.invoke({
      route: state.route || 'unknown',
      normalizedInput: state.normalizedInput || '',
    });

    return {
      ...state,
      composedResponse: structuredOutput.content,
      confidence: structuredOutput.confidence,
      // Update intent if the model decided to escalate
      intent: structuredOutput.escalate_flag ? 'ESCALATION' : state.intent,
    };
  } catch (error) {
    console.error('[Composition Chain] Failed to parse structured output or model failed:', error);

    // 3. Ultimate Safe Fallback
    const safeFallback = {
      content: 'System have some trouble.',
      confidence: 0,
      escalate_flag: true,
    };

    return {
      ...state,
      composedResponse: safeFallback.content,
      confidence: safeFallback.confidence,
      intent: safeFallback.escalate_flag ? 'ESCALATION' : state.intent,
    };
  }
});
