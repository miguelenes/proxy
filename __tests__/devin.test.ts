/**
 * Devin v3 provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDevinUrl,
  buildDevinOrgUrl,
  buildPaginationQuery,
  mapDevinError,
  devinAuthHeaders,
  DEVIN_DEFAULTS,
} from '../src/providers/devin.js';

describe('buildDevinUrl', () => {
  it('builds correct base URL for /self', () => {
    expect(buildDevinUrl('/self')).toBe(`${DEVIN_DEFAULTS.baseUrl}/self`);
  });

  it('normalizes path without leading slash', () => {
    expect(buildDevinUrl('self')).toBe(`${DEVIN_DEFAULTS.baseUrl}/self`);
  });

  it('strips trailing slash from custom base', () => {
    expect(buildDevinUrl('/self', 'https://api.devin.ai/v3/')).toBe(
      'https://api.devin.ai/v3/self'
    );
  });
});

describe('buildDevinOrgUrl', () => {
  it('builds organization-scoped sessions path', () => {
    expect(buildDevinOrgUrl('abc', '/sessions')).toBe(
      `${DEVIN_DEFAULTS.baseUrl}/organizations/abc/sessions`
    );
  });
});

describe('buildPaginationQuery', () => {
  it('builds first and after query string', () => {
    expect(buildPaginationQuery({ first: 25, after: 'cursor1' })).toBe(
      '?first=25&after=cursor1'
    );
  });

  it('returns empty string when no options', () => {
    expect(buildPaginationQuery({})).toBe('');
  });

  it('forwards extra query params', () => {
    expect(buildPaginationQuery({ query: { start_date: '2025-01-01' } })).toBe(
      '?start_date=2025-01-01'
    );
  });
});

describe('mapDevinError', () => {
  it('returns hints for common status codes', () => {
    expect(mapDevinError(401, { error: 'unauthorized' }).hint).toContain('DEVIN_API_KEY');
    expect(mapDevinError(401, { error: 'unauthorized' }).hint).toContain('cog_');
    expect(mapDevinError(403, { error: 'forbidden' }).hint).toContain('permission');
    expect(mapDevinError(404, { error: 'not found' }).hint).toContain('not found');
    expect(mapDevinError(422, { error: 'validation' }).hint).toContain('Validation');
    expect(mapDevinError(429, { error: 'rate limit' }).hint).toContain('Rate limited');
    expect(mapDevinError(500, { error: 'internal' }).hint).toContain('Server error');
  });
});

describe('devinAuthHeaders', () => {
  it('includes Bearer token and Accept header', () => {
    expect(devinAuthHeaders('cog_test_key')).toEqual({
      Authorization: 'Bearer cog_test_key',
      Accept: 'application/json',
    });
  });
});
