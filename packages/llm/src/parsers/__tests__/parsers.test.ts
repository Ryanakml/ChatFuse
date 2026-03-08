import { describe, it, expect } from 'vitest';
import {
  IntentSchema,
  StandardResponseSchema,
  StructuredOutputSchema,
  intentParser,
  standardResponseParser,
  intentEnum,
} from '../index.js';

describe('Parsers / Schemas (L2 – Unit)', () => {
  // ─── intentEnum ───────────────────────────────────────────────────────────

  describe('intentEnum', () => {
    it.each(['RAG', 'TOOL', 'CLARIFICATION', 'ESCALATION'])(
      'accepts valid intent value "%s"',
      (value) => {
        expect(() => intentEnum.parse(value)).not.toThrow();
      },
    );

    it('rejects an invalid intent value', () => {
      expect(() => intentEnum.parse('INVALID')).toThrow();
    });
  });

  // ─── IntentSchema ─────────────────────────────────────────────────────────

  describe('IntentSchema', () => {
    it('parses a fully valid intent classification object', () => {
      const result = IntentSchema.safeParse({
        intent: 'RAG',
        confidence: 0.85,
        reasoning: 'User asked a how-to question',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.intent).toBe('RAG');
        expect(result.data.confidence).toBe(0.85);
      }
    });

    it('rejects confidence below 0', () => {
      const result = IntentSchema.safeParse({
        intent: 'RAG',
        confidence: -0.1,
        reasoning: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects confidence above 1', () => {
      const result = IntentSchema.safeParse({
        intent: 'RAG',
        confidence: 1.1,
        reasoning: 'test',
      });
      expect(result.success).toBe(false);
    });

    it('accepts confidence at boundary values 0 and 1', () => {
      expect(
        IntentSchema.safeParse({ intent: 'TOOL', confidence: 0, reasoning: 'low' }).success,
      ).toBe(true);
      expect(
        IntentSchema.safeParse({ intent: 'TOOL', confidence: 1, reasoning: 'high' }).success,
      ).toBe(true);
    });

    it('rejects missing required fields', () => {
      expect(IntentSchema.safeParse({ intent: 'RAG' }).success).toBe(false);
    });
  });

  // ─── StandardResponseSchema ───────────────────────────────────────────────

  describe('StandardResponseSchema', () => {
    it('parses a response without optional suggestedActions', () => {
      const result = StandardResponseSchema.safeParse({ message: 'Hello!' });
      expect(result.success).toBe(true);
    });

    it('parses a response with suggestedActions', () => {
      const result = StandardResponseSchema.safeParse({
        message: 'Choose an option',
        suggestedActions: ['Option A', 'Option B'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.suggestedActions).toHaveLength(2);
      }
    });

    it('rejects a missing message field', () => {
      expect(StandardResponseSchema.safeParse({ suggestedActions: [] }).success).toBe(false);
    });
  });

  // ─── StructuredOutputSchema ───────────────────────────────────────────────

  describe('StructuredOutputSchema', () => {
    it('parses a valid structured output', () => {
      const result = StructuredOutputSchema.safeParse({
        content: 'Here is your answer.',
        confidence: 0.9,
        escalate_flag: false,
      });
      expect(result.success).toBe(true);
    });

    it('rejects when escalate_flag is not boolean', () => {
      const result = StructuredOutputSchema.safeParse({
        content: 'ok',
        confidence: 0.5,
        escalate_flag: 'yes',
      });
      expect(result.success).toBe(false);
    });

    it('rejects when confidence is out of range', () => {
      expect(
        StructuredOutputSchema.safeParse({ content: 'ok', confidence: 2, escalate_flag: false })
          .success,
      ).toBe(false);
    });
  });

  // ─── intentParser (StructuredOutputParser) ────────────────────────────────

  describe('intentParser', () => {
    it('parses a valid JSON string produced by an LLM', async () => {
      const json = JSON.stringify({
        intent: 'ESCALATION',
        confidence: 0.75,
        reasoning: 'User asked explicitly for a human.',
      });
      const result = await intentParser.parse(json);
      expect(result.intent).toBe('ESCALATION');
      expect(result.confidence).toBe(0.75);
    });

    it('throws on malformed JSON', async () => {
      await expect(intentParser.parse('not-valid-json')).rejects.toThrow();
    });

    it('throws on valid JSON that violates the schema', async () => {
      const badJson = JSON.stringify({ intent: 'BOGUS', confidence: 5, reasoning: 'x' });
      await expect(intentParser.parse(badJson)).rejects.toThrow();
    });

    it('exposes format instructions as a non-empty string', () => {
      const instructions = intentParser.getFormatInstructions();
      expect(typeof instructions).toBe('string');
      expect(instructions.length).toBeGreaterThan(0);
    });
  });

  // ─── standardResponseParser ───────────────────────────────────────────────

  describe('standardResponseParser', () => {
    it('parses a valid standard response JSON string', async () => {
      const json = JSON.stringify({ message: 'Your order is on the way!' });
      const result = await standardResponseParser.parse(json);
      expect(result.message).toBe('Your order is on the way!');
    });
  });
});
