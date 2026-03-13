import { describe, it, expect, vi, beforeEach } from 'vitest';

const { orderStatusInvokeMock, missingToolInvokeMock } = vi.hoisted(() => ({
  orderStatusInvokeMock: vi.fn(),
  missingToolInvokeMock: vi.fn(),
}));

vi.mock('../../../tools/index.js', () => ({
  businessTools: [
    {
      name: 'order_status_lookup',
      invoke: orderStatusInvokeMock,
    },
    {
      name: 'product_information',
      invoke: missingToolInvokeMock,
    },
  ],
}));

import { toolExecutionChain } from '../tool-execution.js';
import type { AgentState } from '../../types.js';

describe('toolExecutionChain', () => {
  beforeEach(() => {
    orderStatusInvokeMock.mockReset();
    missingToolInvokeMock.mockReset();
  });

  it('passes through state when route is not tool_path', async () => {
    const state: AgentState = {
      originalInput: 'halo',
      route: 'rag_path',
      normalizedInput: 'halo',
    };

    const result = await toolExecutionChain.invoke(state);

    expect(result).toEqual(state);
    expect(orderStatusInvokeMock).not.toHaveBeenCalled();
  });

  it('executes order_status_lookup for tool_path requests and stores metadata', async () => {
    orderStatusInvokeMock.mockResolvedValueOnce('{"status":"processing"}');

    const state: AgentState = {
      originalInput: 'cek status pesanan 12345',
      normalizedInput: 'cek status pesanan 12345',
      route: 'tool_path',
    };

    const result = await toolExecutionChain.invoke(state);

    expect(orderStatusInvokeMock).toHaveBeenCalledTimes(1);
    expect(result.composedResponse).toContain('processing');
    expect(result.toolExecution?.toolName).toBe('order_status_lookup');
    expect(result.toolExecution?.toolSuccess).toBe(true);
    expect(typeof result.toolExecution?.toolDurationMs).toBe('number');
  });

  it('returns safe fallback when tool invocation throws', async () => {
    orderStatusInvokeMock.mockRejectedValueOnce(new Error('tool failed'));

    const state: AgentState = {
      originalInput: 'track order 12345',
      normalizedInput: 'track order 12345',
      route: 'tool_path',
    };

    const result = await toolExecutionChain.invoke(state);

    expect(result.composedResponse).toContain('Maaf');
    expect(result.toolExecution?.toolName).toBe('order_status_lookup');
    expect(result.toolExecution?.toolSuccess).toBe(false);
  });
});
