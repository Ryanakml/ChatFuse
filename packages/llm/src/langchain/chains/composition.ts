import { RunnableLambda } from '@langchain/core/runnables';
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from '@langchain/core/prompts';
import { createStructuredModelRouter } from '../../router/model-router.js';
import { StructuredOutputSchema } from '../../parsers/index.js';
import type { AgentState } from '../types.js';

const SYSTEM_PROMPT = `You are a helpful WhatsApp AI assistant for a customer support service.
Your goal is to compose a final response based on the routing decision, user input, and provided context.
You must return your response following the exact required schema.
Always respond in Bahasa Indonesia unless the user writes in English, in which case respond in English.

ROUTING RULES:
- If route is rag_path and context is available: answer strictly based on the provided context. Do not make up facts.
- If route is rag_path and context is empty or insufficient: politely say you don't have that information and suggest contacting CS.
- If route is clarification_path and intent is GREETING: respond warmly and ask how you can help. Never ask for clarification for greetings. Example: "Hi! How can I help you today?"
- If route is clarification_path with high confidence (genuinely unclear): politely ask the user to clarify what they need.
- If route is escalation_path: inform the user they will be connected to a human agent.
- NEVER respond with raw "I need clarification" as a standalone message. Always frame it naturally and warmly.
- NEVER make up product names, prices, policies, or order details not present in context.
`;

const compositionPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(SYSTEM_PROMPT),
  HumanMessagePromptTemplate.fromTemplate(`Routing Decision: {route}
Intent: {intent}
User Input: {normalizedInput}
Retrieved Context:
{retrievedContext}
Citations Context:
{citationsText}

Please provide the best response to the user.`),
]);

// Initialize the model router enforcing the schema with native tool calling
const modelRouter = createStructuredModelRouter(StructuredOutputSchema);
const geminiFirstRouter = createStructuredModelRouter(StructuredOutputSchema, {
  primaryProvider: 'gemini',
});

const isOpenAiRateLimitError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /openai|429|rate.?limit|quota|too many requests/.test(message);
};

/**
 * Step 6: Response composition chain.
 * Composes the final response string based on the chosen route.
 * Forces machine-readable schema using native tool calling and provides an ultimate safe fallback.
 */
export const compositionChain = RunnableLambda.from(async (state: AgentState) => {
  if (state.composedResponse && state.composedResponse.trim() !== '') {
    return state;
  }

  try {
    // Link the prompt to the structured output router
    const primaryChain = compositionPrompt.pipe(modelRouter);

    // Format citations to pass to prompt if available
    const citationsText =
      state.citations && state.citations.length > 0
        ? JSON.stringify(state.citations, null, 2)
        : 'No citations available';

    const chainInput = {
      route: state.route || 'unknown',
      intent: state.intent || 'unknown',
      normalizedInput: state.normalizedInput || '',
      retrievedContext: state.retrievedContext || 'No context available',
      citationsText,
    };

    // Invoke the chain, expecting it to return the z.infer<typeof StructuredOutputSchema> type
    let structuredOutput: {
      content: string;
      confidence: number;
      escalate_flag: boolean;
    };

    try {
      structuredOutput = await primaryChain.invoke(chainInput);
    } catch (primaryError) {
      if (!isOpenAiRateLimitError(primaryError)) {
        throw primaryError;
      }

      // Explicit provider retry for rate-limit/quota scenarios.
      const fallbackChain = compositionPrompt.pipe(geminiFirstRouter);
      structuredOutput = await fallbackChain.invoke(chainInput);
    }

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
