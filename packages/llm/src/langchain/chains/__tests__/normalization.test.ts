import { describe, it, expect } from 'vitest';
import { normalizationChain } from '../normalization.js';
import type { AgentState } from '../../types.js';

describe('normalizationChain (L2 – Unit)', () => {
  function invoke(originalInput: AgentState['originalInput']): Promise<AgentState> {
    return normalizationChain.invoke({ originalInput } as AgentState) as Promise<AgentState>;
  }

  it('normalizes a plain string by trimming whitespace', async () => {
    const result = await invoke('  hello world  ');
    expect(result.normalizedInput).toBe('hello world');
  });

  it('returns an empty string for an empty string input', async () => {
    const result = await invoke('');
    expect(result.normalizedInput).toBe('');
  });

  it('returns an empty string for a whitespace-only string', async () => {
    const result = await invoke('   ');
    expect(result.normalizedInput).toBe('');
  });

  it('extracts text field from an object payload', async () => {
    const result = await invoke({ text: '  order status  ' });
    expect(result.normalizedInput).toBe('order status');
  });

  it('extracts message field from an object payload when text is absent', async () => {
    const result = await invoke({ message: '  track my package  ' });
    expect(result.normalizedInput).toBe('track my package');
  });

  it('returns empty string for an object without text or message fields', async () => {
    const result = await invoke({ unknown: 'data' });
    expect(result.normalizedInput).toBe('');
  });

  it('passes through existing state fields unchanged', async () => {
    const result = await invoke('ping');
    expect(result.originalInput).toBe('ping');
    expect(result.normalizedInput).toBe('ping');
  });

  it('preserves internal whitespace – only leading/trailing is trimmed', async () => {
    const result = await invoke('  hello   world  ');
    // Normalization trims edges but does NOT collapse internal whitespace;
    // this test documents and contracts the current behaviour.
    expect(result.normalizedInput).toBe('hello   world');
  });
});
