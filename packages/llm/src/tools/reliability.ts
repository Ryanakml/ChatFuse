export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Executes a promise with a hard timeout.
 * @param promiseFn Function returning a promise to execute
 * @param timeoutMs Timeout in milliseconds
 * @returns Result of the promise
 * @throws TimeoutError if the promise doesn't resolve within timeoutMs
 */
export async function withTimeout<T>(promiseFn: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promiseFn()
      .then((res) => {
        clearTimeout(timeoutId);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

/**
 * Determines if an error is transient and should be retried.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof TimeoutError) {
    return true;
  }

  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;

    // Example status codes check (e.g., from axios or fetch)
    const status =
      errObj.status || (errObj.response as Record<string, unknown> | undefined)?.status;
    if (typeof status === 'number' && (status === 408 || status === 429 || status >= 500)) {
      return true;
    }

    // Network errors
    const code = errObj.code;
    const message = typeof errObj.message === 'string' ? errObj.message : '';

    if (code === 'ECONNABORTED' || code === 'ECONNRESET' || message.includes('network')) {
      return true;
    }
  }

  return false;
}

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffFactor?: number;
}

/**
 * Retries a promise-returning function upon transient errors.
 * Uses exponential backoff.
 */
export async function withRetry<T>(
  promiseFn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  let delayMs = options.initialDelayMs ?? 500;
  const backoffFactor = options.backoffFactor ?? 2;

  let attempt = 1;

  while (true) {
    try {
      return await promiseFn();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));

      attempt++;
      delayMs *= backoffFactor;
    }
  }
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of consecutive failures before opening
  resetTimeoutMs?: number; // Time to wait before transition to HALF_OPEN
}

export class CircuitBreakerError extends Error {
  constructor(message: string = 'Circuit breaker is OPEN') {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit breaker to protect failing downstream dependencies.
 */
export class CircuitBreaker {
  private failureThreshold: number;
  private resetTimeoutMs: number;

  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private consecutiveFailures: number = 0;
  private nextAttemptTime: number = 0;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30000;
  }

  public getState(): CircuitBreakerState {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() >= this.nextAttemptTime) {
        this.state = CircuitBreakerState.HALF_OPEN;
      }
    }
    return this.state;
  }

  public async execute<T>(promiseFn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === CircuitBreakerState.OPEN) {
      throw new CircuitBreakerError();
    }

    try {
      const result = await promiseFn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
    }
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.resetTimeoutMs;
    }
  }
}
