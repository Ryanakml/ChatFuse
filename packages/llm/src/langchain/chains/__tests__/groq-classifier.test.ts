import { describe, it, expect } from 'vitest';
import { parseIntentRouterJson, parsePolicyRouterJson, parseToolRouterJson } from '../groq-classifier.js';

describe('parseIntentRouterJson', () => {
  it('parses valid classifier JSON', () => {
    const result = parseIntentRouterJson('{"intent":"RAG","confidence":0.92}');
    expect(result).toEqual({ intent: 'RAG', confidence: 0.92 });
  });

  it('parses valid JSON wrapped in markdown fences', () => {
    const result = parseIntentRouterJson('```json\n{"intent":"TOOL","confidence":0.7}\n```');
    expect(result).toEqual({ intent: 'TOOL', confidence: 0.7 });
  });

  it('throws for invalid intent value', () => {
    expect(() => parseIntentRouterJson('{"intent":"UNKNOWN","confidence":0.5}')).toThrow(
      /invalid intent/i,
    );
  });

  it('throws for confidence outside 0..1', () => {
    expect(() => parseIntentRouterJson('{"intent":"RAG","confidence":1.2}')).toThrow(
      /invalid confidence/i,
    );
  });

  it('throws for non-json output', () => {
    expect(() => parseIntentRouterJson('not-json')).toThrow(/invalid json/i);
  });
});

describe('parseToolRouterJson', () => {
  it('parses valid tool selection JSON', () => {
    const result = parseToolRouterJson('{"toolName":"order_status_lookup","confidence":0.82}');
    expect(result).toEqual({ toolName: 'order_status_lookup', confidence: 0.82 });
  });

  it('throws for invalid toolName', () => {
    expect(() => parseToolRouterJson('{"toolName":"unknown_tool","confidence":0.6}')).toThrow(
      /invalid toolname/i,
    );
  });
});

describe('parsePolicyRouterJson', () => {
  it('parses valid policy classifier JSON', () => {
    const result = parsePolicyRouterJson('{"policyAction":"block","confidence":0.9}');
    expect(result).toEqual({ policyAction: 'block', confidence: 0.9 });
  });

  it('throws for invalid policyAction', () => {
    expect(() =>
      parsePolicyRouterJson('{"policyAction":"reject","confidence":0.4}'),
    ).toThrow(/invalid policyaction/i);
  });
});
