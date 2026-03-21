import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { orderStatusLookupTool, supportTicketCreationTool, escalateToHumanTool } from '../index.js';
import * as reliability from '../reliability.js';
import { lookupOrderByPhone } from '../repositories/orders.js';
import { createSupportTicket } from '../repositories/tickets.js';

vi.mock('../repositories/orders.js', () => ({
  lookupOrderByPhone: vi.fn(),
}));

vi.mock('../repositories/tickets.js', () => ({
  createSupportTicket: vi.fn(),
}));

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
      customerPhone: '+628100000001',
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toContain('sistem sedang mengalami kendala teknis');
    expect(console.error).toHaveBeenCalled();
  });

  it('orderStatusLookupTool should wrap execution in withRetry and withTimeout', async () => {
    vi.mocked(lookupOrderByPhone).mockResolvedValueOnce({
      order: {
        id: 'order-1',
        external_order_id: 'ORD-123',
        customer_phone: '+628100000002',
        customer_email: null,
        status: 'processing',
        payment_status: 'paid',
        fulfillment_status: 'picking',
        currency: 'USD',
        total_amount: 100,
        placed_at: null,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      shipments: [],
    });

    const promise = orderStatusLookupTool.invoke({
      orderId: 'ORD-123',
      customerPhone: '+628100000002',
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(reliability.withRetry).toHaveBeenCalled();
    expect(reliability.withTimeout).toHaveBeenCalled();

    const parsed = JSON.parse(result as string);
    expect(parsed.found).toBe(true);
    expect(parsed.order.external_order_id).toBe('ORD-123');
    expect(parsed.order.status).toBe('processing');
  });

  it('supportTicketCreationTool should accept and reflect idempotencyKey and use wrappers when confirmed', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(createSupportTicket).mockResolvedValueOnce({
      id: 'ticket-123',
      conversation_id: 'conversation-123',
      external_ticket_id: null,
      status: 'open',
      priority: 'high',
      metadata: {
        category: 'technical',
        issueDescription: 'My internet keeps dropping',
        idempotencyKey: 'idem-12345',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const promise = supportTicketCreationTool.invoke({
      conversationId: 'conversation-123',
      customerEmail: 'customer@example.com',
      customerPhone: '+628123456789',
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
    expect(parsed.ticketId).toBe('ticket-123');
    expect(parsed.status).toBe('open');
    expect(parsed.priority).toBe('high');
    expect(parsed.metadata.idempotencyKey).toBe('idem-12345');
    expect(consoleSpy).toHaveBeenCalledTimes(2); // before and after logs
  });

  it('supportTicketCreationTool should request confirmation if not confirmed', async () => {
    const result = await supportTicketCreationTool.invoke({
      conversationId: 'conversation-123',
      customerEmail: 'customer@example.com',
      customerPhone: '+628123456789',
      issueDescription: 'My internet keeps dropping',
      category: 'technical',
      priority: 'high',
      idempotencyKey: 'idem-12345',
      // confirmed is undefined
    });

    expect(result).toContain('Mohon konfirmasi pembuatan tiket');
    expect(result).toContain('My internet keeps dropping');
  });

  it('escalateToHumanTool should return escalation message and log event', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await escalateToHumanTool.invoke({
      reason: 'User is very angry',
    });

    expect(result).toContain('sudah saya eskalasikan ke agen customer service manusia');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('escalation_triggered'));
  });
});
