import { describe, it, expect, vi } from 'vitest';
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
import { confidenceChain } from '../confidence.js';
import type { AgentState } from '../../types.js';

describe('confidenceChain', () => {
  it('should return 0.9 confidence for TOOL intent', async () => {
    const state: AgentState = {
      originalInput: 'test',
      intent: 'TOOL',
    };
    const result = await confidenceChain.invoke(state);
    expect(result.confidence).toBe(0.9);
  });

  it('should return 0.9 confidence for RAG intent when retrievalConfidence is >= 0.7', async () => {
    const state: AgentState = {
      originalInput: 'test',
      intent: 'RAG',
      retrievalConfidence: 0.85,
    };
    const result = await confidenceChain.invoke(state);
    expect(result.confidence).toBe(0.9);
  });

  it('should return 0.3 confidence for RAG intent when retrievalConfidence is < 0.7', async () => {
    const state: AgentState = {
      originalInput: 'test',
      intent: 'RAG',
      retrievalConfidence: 0.5,
    };
    const result = await confidenceChain.invoke(state);
    expect(result.confidence).toBe(0.3); // Triggers fallback
  });

  it('should return 0.9 confidence for RAG intent when retrievalConfidence is undefined (legacy behavior)', async () => {
    const state: AgentState = {
      originalInput: 'test',
      intent: 'RAG',
    };
    const result = await confidenceChain.invoke(state);
    expect(result.confidence).toBe(0.9);
  });

  it('should return 0.95 confidence for ESCALATION intent', async () => {
    const state: AgentState = {
      originalInput: 'test',
      intent: 'ESCALATION',
    };
    const result = await confidenceChain.invoke(state);
    expect(result.confidence).toBe(0.95);
  });
});
