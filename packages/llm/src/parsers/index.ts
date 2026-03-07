import { z } from 'zod';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

// Intent Classification Parser
export const intentEnum = z.enum(['RAG', 'TOOL', 'CLARIFICATION', 'ESCALATION']);
export type IntentCategory = z.infer<typeof intentEnum>;

export const IntentSchema = z.object({
  intent: intentEnum.describe('The classified intent of the user message'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score of the classification (0.0 to 1.0)'),
  reasoning: z.string().describe('Brief reasoning for the classification'),
});

export type IntentClassification = z.infer<typeof IntentSchema>;

export const intentParser = StructuredOutputParser.fromZodSchema(IntentSchema);

// Standard Response Parser (for general agent replies)
export const StandardResponseSchema = z.object({
  message: z.string().describe('The text message to send back to the user via WhatsApp'),
  suggestedActions: z
    .array(z.string())
    .optional()
    .describe('Optional suggested quick replies, button labels, or physical actions'),
});

export type StandardResponse = z.infer<typeof StandardResponseSchema>;

export const standardResponseParser = StructuredOutputParser.fromZodSchema(StandardResponseSchema);

// Agent Response Parser (for structured outputs via G5)
export const StructuredOutputSchema = z.object({
  content: z.string().describe('The main text response to the user'),
  confidence: z.number().min(0).max(1).describe('Confidence score of the response (0.0 to 1.0)'),
  escalate_flag: z
    .boolean()
    .describe('Whether the conversation should be escalated to a human agent'),
});

export type StructuredOutput = z.infer<typeof StructuredOutputSchema>;
