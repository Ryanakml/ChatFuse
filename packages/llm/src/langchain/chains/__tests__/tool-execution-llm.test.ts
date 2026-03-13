import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentState } from '../../types.js';

const { orderStatusInvokeMock, classifyToolWithGroqMock } = vi.hoisted(() => ({
  orderStatusInvokeMock: vi.fn(),
  classifyToolWithGroqMock: vi.fn(),
}));

vi.mock('../../../tools/index.js', () => ({
  businessTools: [
    {
      name: 'order_status_lookup',
      invoke: orderStatusInvokeMock,
    },
  ],
}));

vi.mock('../groq-classifier.js', () => ({
  classifyToolWithGroq: classifyToolWithGroqMock,
}));

import { toolExecutionChain } from '../tool-execution.js';

describe('toolExecutionChain (LLM selection layer)', () => {
  beforeEach(() => {
    orderStatusInvokeMock.mockReset();
    classifyToolWithGroqMock.mockReset();
  });

  it('uses LLM-selected tool when available', async () => {
    classifyToolWithGroqMock.mockResolvedValueOnce({
      toolName: 'order_status_lookup',
      confidence: 0.95,
    });
    orderStatusInvokeMock.mockResolvedValueOnce('{"status":"processing"}');

    const state: AgentState = {
      originalInput: 'status pesanan saya',
      normalizedInput: 'status pesanan saya',
      route: 'tool_path',
    };

    const result = await toolExecutionChain.invoke(state);

    expect(classifyToolWithGroqMock).toHaveBeenCalledTimes(1);
    expect(orderStatusInvokeMock).toHaveBeenCalledTimes(1);
    expect(result.toolExecution?.toolName).toBe('order_status_lookup');
    expect(result.toolExecution?.toolSuccess).toBe(true);
  });

  it('returns clarification response when LLM selects none', async () => {
    classifyToolWithGroqMock.mockResolvedValueOnce({
      toolName: 'none',
      confidence: 0.81,
    });

    const state: AgentState = {
      originalInput: 'tolong bantu',
      normalizedInput: 'tolong bantu',
      route: 'tool_path',
    };

    const result = await toolExecutionChain.invoke(state);

    expect(orderStatusInvokeMock).not.toHaveBeenCalled();
    expect(result.composedResponse).toContain('detail tambahan');
    expect(result.toolExecution?.toolName).toBe(null);
  });

  it('falls back to regex detection when LLM tool selection fails', async () => {
    classifyToolWithGroqMock.mockRejectedValueOnce(new Error('timeout'));
    orderStatusInvokeMock.mockResolvedValueOnce('{"status":"processing"}');

    const state: AgentState = {
      originalInput: 'track order 12345',
      normalizedInput: 'track order 12345',
      route: 'tool_path',
    };

    const result = await toolExecutionChain.invoke(state);

    expect(orderStatusInvokeMock).toHaveBeenCalledTimes(1);
    expect(result.toolExecution?.toolName).toBe('order_status_lookup');
    expect(result.toolExecution?.toolSuccess).toBe(true);
  });
});
