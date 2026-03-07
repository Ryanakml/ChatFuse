import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withTimeout,
  TimeoutError,
  withRetry,
  CircuitBreaker,
  CircuitBreakerState,
  CircuitBreakerError,
} from '../reliability.js';

describe('withTimeout', () => {
  it('should resolve if promise completes within timeout', async () => {
    const fn = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'success';
    };

    const result = await withTimeout(fn, 50);
    expect(result).toBe('success');
  });

  it('should throw TimeoutError if promise takes too long', async () => {
    const fn = async () => {
      await new Promise((r) => setTimeout(r, 100));
      return 'success';
    };

    await expect(withTimeout(fn, 20)).rejects.toThrow(TimeoutError);
  });
});

describe('withRetry', () => {
  it('should resolve immediately if no error', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient errors and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new TimeoutError())
      .mockRejectedValueOnce(new TimeoutError())
      .mockResolvedValue('success');

    const result = await withRetry(fn, { initialDelayMs: 1, maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw immediately on non-transient error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Permanent Error'));

    await expect(withRetry(fn)).rejects.toThrow('Permanent Error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should exhaust retry attempts and throw the last transient error', async () => {
    const fn = vi.fn().mockRejectedValue(new TimeoutError('Always Timeout'));

    await expect(withRetry(fn, { initialDelayMs: 1, maxAttempts: 3 })).rejects.toThrow(
      'Always Timeout',
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute successfully in CLOSED state', async () => {
    const cb = new CircuitBreaker();
    const fn = vi.fn().mockResolvedValue('success');

    const result = await cb.execute(fn);

    expect(result).toBe('success');
    expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should trip to OPEN after threshold failures', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Attempt 1: Fails, state CLOSED
    await expect(cb.execute(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);

    // Attempt 2: Fails, threshold reached, trips to OPEN
    await expect(cb.execute(fn)).rejects.toThrow('fail');
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);

    // Attempt 3: Fails fast because it's OPEN
    await expect(cb.execute(fn)).rejects.toThrow(CircuitBreakerError);
    // Underlying function shouldn't be called on Attempt 3
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should transition to HALF_OPEN and then CLOSED on success', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });

    // Trip the breaker
    await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);

    // Fast Forward time beyond the reset timeout
    vi.advanceTimersByTime(1500);

    // After timeout, state should be HALF_OPEN
    expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);

    // Next successful execution should close the breaker
    const result = await cb.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should trip back to OPEN if HALF_OPEN request fails', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000 });

    // Trip the breaker
    await expect(cb.execute(() => Promise.reject(new Error('fail1')))).rejects.toThrow('fail1');
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);

    // Fast Forward time
    vi.advanceTimersByTime(1500);
    expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);

    // Failed attempt while HALF_OPEN trips it back
    await expect(cb.execute(() => Promise.reject(new Error('fail2')))).rejects.toThrow('fail2');
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
  });
});
