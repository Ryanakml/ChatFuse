import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { orderStatusLookupTool, supportTicketCreationTool, escalateToHumanTool } from '../index.js';
import * as reliability from '../reliability.js';

describe('Tool Reliability Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(reliability, 'withTimeout');
    vi.spyOn(reliability, 'withRetry');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('orderStatusLookupTool should safely fallback if an error occurs', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Force the internal implementation to fail (mocking the wrapper or the cb)
    // Actually, since we spy on withRetry, let's just make it throw
    vi.spyOn(reliability, 'withRetry').mockRejectedValueOnce(new Error('Simulated failure'));

    const promise = orderStatusLookupTool.invoke({
      orderId: 'ORD-ERR',
      customerEmail: 'err@example.com',
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toContain(
      "I'm currently unable to complete this action due to a technical issue",
    );
    expect(console.error).toHaveBeenCalled();
  });

  it('orderStatusLookupTool should wrap execution in withRetry and withTimeout', async () => {
    const promise = orderStatusLookupTool.invoke({
      orderId: 'ORD-123',
      customerEmail: 'test@example.com',
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(reliability.withRetry).toHaveBeenCalled();
    expect(reliability.withTimeout).toHaveBeenCalled();

    const parsed = JSON.parse(result as string);
    expect(parsed.orderId).toBe('ORD-123');
    expect(parsed.status).toBe('processing');
  });

  it('supportTicketCreationTool should accept and reflect idempotencyKey and use wrappers when confirmed', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const promise = supportTicketCreationTool.invoke({
      issueDescription: 'My internet keeps dropping',
      category: 'technical',
      priority: 'high',
      idempotencyKey: 'idem-12345',
      confirmed: true,
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(reliability.withRetry).toHaveBeenCalled();
    expect(reliability.withTimeout).toHaveBeenCalled();

    const parsed = JSON.parse(result as string);
    expect(parsed.idempotencyKey).toBe('idem-12345');
    expect(parsed.issueDescription).toBe('My internet keeps dropping');
    expect(consoleSpy).toHaveBeenCalledTimes(2); // before and after logs
  });

  it('supportTicketCreationTool should request confirmation if not confirmed', async () => {
    const result = await supportTicketCreationTool.invoke({
      issueDescription: 'My internet keeps dropping',
      category: 'technical',
      priority: 'high',
      idempotencyKey: 'idem-12345',
      // confirmed is undefined
    });

    expect(result).toContain('Please confirm that you would like to create a support ticket');
    expect(result).toContain('My internet keeps dropping');
  });

  it('escalateToHumanTool should return escalation message and log event', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await escalateToHumanTool.invoke({
      reason: 'User is very angry',
    });

    expect(result).toContain('I have escalated your request to a human support agent');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('escalation_triggered'));
  });
});
