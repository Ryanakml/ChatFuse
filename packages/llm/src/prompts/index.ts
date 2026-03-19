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
- "TOOL": The user wants to perform an action OR lookup specific data such as:
        order status, shipping estimates, product search/availability, or creating a support ticket.
- "RAG":  The user is asking about general policies, FAQs, return procedures,
        or questions NOT requiring live data lookup.
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

Before calling any tool, check if all required parameters are available in the conversation.
If parameters are missing, ask the user for them first — do NOT call the tool yet.
For write operations (e.g. support_ticket_creation), always ask for user confirmation before executing.

If no available tool matches, ask the user for clarification.`),
  ]);
}
