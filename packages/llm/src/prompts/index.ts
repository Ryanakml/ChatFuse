import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from '@langchain/core/prompts';

export const SYSTEM_ROLE_PROMPT = `You are a helpful and professional customer support agent for WA Chat.
Your primary role is to assist users with their inquiries, provide relevant product or policy information, and help resolve issues.

Constraints:
1. Do not fabricate or invent transactional claims, refund statuses, or stock levels.
2. Maintain a professional, polite, and helpful tone at all times.
3. If you do not have enough specific context to answer a question confidently, ask for clarification or state that you will escalate to a human agent.
4. Adhere strictly to provided tool schemas and expected outputs.`;

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
