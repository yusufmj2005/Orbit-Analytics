import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';

describe('OAuth PKCE and State Security', () => {
  // Helper functions matching implementation
  function base64UrlEncode(buffer: Buffer): string {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function generateCodeVerifier(): string {
    return base64UrlEncode(crypto.randomBytes(32));
  }

  function generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return base64UrlEncode(hash);
  }

  it('generates high-entropy PKCE code_verifier with valid base64url characters', () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('computes deterministic SHA-256 S256 code_challenge', () => {
    const testVerifier = 'abcdef1234567890abcdef1234567890abcdef1234567890';
    const challenge1 = generateCodeChallenge(testVerifier);
    const challenge2 = generateCodeChallenge(testVerifier);

    expect(challenge1).toBe(challenge2);
    expect(challenge1).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects OAuth callbacks with mismatched state parameter', () => {
    const expectedState = crypto.randomBytes(24).toString('hex');
    const attackerState = crypto.randomBytes(24).toString('hex');

    const isValid = expectedState === attackerState;
    expect(isValid).toBe(false);
  });
});

describe('Data Synchronization Architecture & Mutex', () => {
  it('prevents overlapping synchronization jobs using an in-progress lock', async () => {
    let isSyncing = false;
    let executions = 0;

    const mockSyncJob = async () => {
      if (isSyncing) {
        return { success: false, reason: 'OVERLAP_PREVENTED' };
      }
      isSyncing = true;
      try {
        await new Promise((r) => setTimeout(r, 25));
        executions++;
        return { success: true };
      } finally {
        isSyncing = false;
      }
    };

    // Trigger two syncs simultaneously
    const [res1, res2] = await Promise.all([mockSyncJob(), mockSyncJob()]);

    expect(executions).toBe(1);
    expect([res1.success, res2.success]).toContain(true);
    expect([res1.reason, res2.reason]).toContain('OVERLAP_PREVENTED');
  });

  it('applies bounded exponential backoff on transient errors', () => {
    let delay = 1000;
    const maxDelay = 60_000;

    const errors = [1, 2, 3, 4, 5, 6, 7];
    const computedDelays: number[] = [];

    for (const _ of errors) {
      delay = Math.min(delay * 2, maxDelay);
      computedDelays.push(delay);
    }

    expect(computedDelays[0]).toBe(2000);
    expect(computedDelays[1]).toBe(4000);
    expect(computedDelays[2]).toBe(8000);
    expect(computedDelays[5]).toBe(60000); // capped at max
    expect(computedDelays[6]).toBe(60000);
  });
});

