import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { orderStatusLookupTool, supportTicketCreationTool } from '../index.js';
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

  it('supportTicketCreationTool should accept and reflect idempotencyKey and use wrappers', async () => {
    const promise = supportTicketCreationTool.invoke({
      issueDescription: 'My internet keeps dropping',
      category: 'technical',
      priority: 'high',
      idempotencyKey: 'idem-12345',
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(reliability.withRetry).toHaveBeenCalled();
    expect(reliability.withTimeout).toHaveBeenCalled();

    const parsed = JSON.parse(result as string);
    expect(parsed.idempotencyKey).toBe('idem-12345');
    expect(parsed.issueDescription).toBe('My internet keeps dropping');
  });
});
