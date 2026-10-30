// Shared HTTP helpers for the external connectors: typed errors, request timeouts,
// and bounded exponential backoff for transient failures.

export class HttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new NetworkError(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Check your internet connection.`);
    }
    throw new NetworkError(`Network request failed: ${err?.cause?.message || err?.message || 'unknown error'}`);
  } finally {
    clearTimeout(timer);
  }
}

// Builds an HttpError from a failed response, preferring the API's own error message.
export async function readApiError(resp: Response, label: string): Promise<HttpError> {
  const text = await resp.text().catch(() => '');
  let detail = text;
  try {
    const parsed = JSON.parse(text);
    detail = parsed?.error?.message || parsed?.error_description || parsed?.error || text;
  } catch {}
  detail = String(detail || resp.statusText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return new HttpError(`${label} (HTTP ${resp.status})${detail ? `: ${detail}` : ''}`, resp.status);
}

export function isTransientError(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (err instanceof HttpError) return err.status === 408 || err.status === 429 || err.status >= 500;
  return false;
}

export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Retries only transient failures (network errors, 408/429/5xx); auth and validation errors fail fast.
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts - 1 || !isTransientError(err)) throw err;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }
}
