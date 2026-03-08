import { describe, it, expect, vi } from 'vitest';

// Mock @wa-chat/shared before importing the router (which references appMetrics)
vi.mock('@wa-chat/shared', () => ({
  appMetrics: {
    agentPathCount: { add: vi.fn() },
  },
}));

import { routerChain } from '../router.js';
import type { AgentState } from '../../types.js';

describe('routerChain (L2 – Unit)', () => {
  async function route(partial: Partial<AgentState>): Promise<AgentState['route']> {
    const state: AgentState = { originalInput: '', ...partial };
    const result = (await routerChain.invoke(state)) as AgentState;
    return result.route;
  }

  it('routes RAG intent with sufficient confidence to rag_path', async () => {
    expect(await route({ intent: 'RAG', confidence: 0.9 })).toBe('rag_path');
  });

  it('routes TOOL intent with sufficient confidence to tool_path', async () => {
    expect(await route({ intent: 'TOOL', confidence: 0.9 })).toBe('tool_path');
  });

  it('routes CLARIFICATION intent to clarification_path', async () => {
    expect(await route({ intent: 'CLARIFICATION', confidence: 0.9 })).toBe('clarification_path');
  });

  it('routes ESCALATION intent to escalation_path (highest priority)', async () => {
    expect(await route({ intent: 'ESCALATION', confidence: 0.9 })).toBe('escalation_path');
  });

  // Confidence thresholds
  it('escalates when confidence < 0.3 regardless of intent', async () => {
    expect(await route({ intent: 'RAG', confidence: 0.2 })).toBe('escalation_path');
  });

  it('routes to clarification_path when 0.3 <= confidence < 0.6', async () => {
    expect(await route({ intent: 'RAG', confidence: 0.5 })).toBe('clarification_path');
  });

  it('routes correctly when confidence is exactly 0.6', async () => {
    // Confidence == 0.6 is not < 0.6, so should proceed to intent check → RAG
    expect(await route({ intent: 'RAG', confidence: 0.6 })).toBe('rag_path');
  });

  it('routes correctly when confidence is exactly 0.3', async () => {
    // Confidence == 0.3 is not < 0.3, so escalation threshold is not triggered
    // Then 0.3 < 0.6 triggers clarification
    expect(await route({ intent: 'RAG', confidence: 0.3 })).toBe('clarification_path');
  });

  it('escalates even for TOOL intent if confidence is very low', async () => {
    expect(await route({ intent: 'TOOL', confidence: 0.1 })).toBe('escalation_path');
  });

  it('falls back to clarification_path for UNKNOWN intent with high confidence', async () => {
    // UNKNOWN doesn't match any specific branch → fallback
    expect(await route({ intent: 'UNKNOWN', confidence: 0.95 })).toBe('clarification_path');
  });

  it('falls back to clarification_path when confidence is undefined', async () => {
    // undefined confidence: (undefined ?? 0) = 0 < 0.3 → escalation
    expect(await route({ intent: 'RAG' })).toBe('escalation_path');
  });
});
