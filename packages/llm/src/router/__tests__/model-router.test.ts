import { describe, it, expect } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { calculateResponseCost } from '../model-router.js';

describe('calculateResponseCost', () => {
  it('should calculate OpenAI cost correctly', () => {
    const message = new AIMessage({
      content: 'Hello OpenAI',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    message.usage_metadata = {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    };

    const result = calculateResponseCost(message as AIMessage, 'gpt-4o-mini');

    expect(result.provider).toBe('openai');
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);

    const expectedCost = (100 / 1000) * 0.00015 + (50 / 1000) * 0.0006;
    expect(result.estimatedCostUsd).toBeCloseTo(expectedCost, 5);
  });

  it('should calculate Gemini cost correctly', () => {
    const message = new AIMessage({
      content: 'Hello Gemini',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    message.usage_metadata = {
      input_tokens: 200,
      output_tokens: 10,
      total_tokens: 210,
    };

    const result = calculateResponseCost(message as AIMessage, 'gemini-1.5-flash');

    expect(result.provider).toBe('gemini');
    expect(result.usage.inputTokens).toBe(200);
    expect(result.usage.outputTokens).toBe(10);

    const expectedCost = (200 / 1000) * 0.000075 + (10 / 1000) * 0.0003;
    expect(result.estimatedCostUsd).toBeCloseTo(expectedCost, 5);
  });

  it('should handle zero tokens and unknown models gracefully', () => {
    const message = new AIMessage({
      content: 'Hello unknown',
    });

    const result = calculateResponseCost(message, 'unknown-model');

    expect(result.provider).toBe('unknown');
    expect(result.usage.inputTokens).toBe(0);
    expect(result.usage.outputTokens).toBe(0);
    expect(result.estimatedCostUsd).toBe(0);
  });
});
