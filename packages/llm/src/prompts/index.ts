import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from '@langchain/core/prompts';

import { getSystemPrompt } from './system.js';

export * from './versioning.js';
export * from './system.js';

export const SYSTEM_ROLE_PROMPT = getSystemPrompt();

export function createIntentClassificationPrompt(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(SYSTEM_ROLE_PROMPT),
    HumanMessagePromptTemplate.fromTemplate(`Classify the intent of the following user message:

User Message: {user_message}

Intent Categories:
- "RAG": The user is asking a general question about policies, FAQs, or product information.
- "TOOL": The user wants to perform an action or lookup specific order/shipping status that requires a tool.
- "CLARIFICATION": The user's request is too vague to act on.
- "ESCALATION": The user wants to speak to a human or the issue is severe.

Please refer to the formatting instructions and output accordingly.
{format_instructions}`),
  ]);
}

export function createRagAnswerPrompt(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(SYSTEM_ROLE_PROMPT),
    HumanMessagePromptTemplate.fromTemplate(`Answer the user's question based strictly on the provided context.

Context:
{context}

User Question: {user_question}

If the context does not contain the answer, say "I'm sorry, I don't have enough information to answer that question right now."`),
  ]);
}

export function createToolDecisionPrompt(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    SystemMessagePromptTemplate.fromTemplate(SYSTEM_ROLE_PROMPT),
    HumanMessagePromptTemplate.fromTemplate(`The user's intent requires a tool invocation. Decide which tool to use based on their request.

User Message: {user_message}

AVAILABLE TOOLS:
{available_tools}

If no available tool matches, ask the user for clarification.`),
  ]);
}
