import crypto from 'node:crypto';

// Base64URL encoding without padding (RFC 7636)
export function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier(): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

export function generateCodeChallenge(verifier: string): string {
  return base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
}

export function generateState(): string {
  return crypto.randomBytes(24).toString('hex');
}

// Constant-time comparison so the callback state check doesn't leak timing information.
export function statesMatch(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
