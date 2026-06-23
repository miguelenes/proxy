/**
 * Cursor team API provider module tests.
 */
import { describe, it, expect } from 'vitest';
import {
  cursorBasicAuthHeaders,
  buildCursorUrl,
  isAllowedCursorPath,
  mapCursorError,
  CURSOR_DEFAULTS,
} from '../src/providers/cursor.js';

describe('cursorBasicAuthHeaders', () => {
  it('produces Basic auth with key as username and empty password', () => {
    expect(cursorBasicAuthHeaders('crsr_test')).toEqual({
      Authorization: 'Basic Y3Jzcl90ZXN0Og==',
      Accept: 'application/json',
    });
  });
});

describe('buildCursorUrl', () => {
  it('builds team members URL', () => {
    expect(buildCursorUrl('/teams/members')).toBe(
      `${CURSOR_DEFAULTS.baseUrl}/teams/members`
    );
  });
});

describe('isAllowedCursorPath', () => {
  it('allows analytics team paths', () => {
    expect(isAllowedCursorPath('/analytics/team/dau')).toBe(true);
  });

  it('allows teams and settings prefixes', () => {
    expect(isAllowedCursorPath('/teams/members')).toBe(true);
    expect(isAllowedCursorPath('/settings/repo-blocklists/repos')).toBe(true);
    expect(isAllowedCursorPath('/analytics/ai-code/commits')).toBe(true);
  });

  it('rejects Cloud Agents paths', () => {
    expect(isAllowedCursorPath('/v1/me')).toBe(false);
  });
});

describe('mapCursorError', () => {
  it('returns hints for common status codes', () => {
    expect(mapCursorError(401, { error: 'Unauthorized' }).hint).toContain('CURSOR_API_KEY');
    expect(mapCursorError(403, { error: 'Forbidden' }).hint).toContain('Enterprise');
    expect(mapCursorError(429, { error: 'Too Many Requests' }).hint).toContain('Rate limited');
    expect(mapCursorError(500, { error: 'internal' }).hint).toContain('Server error');
  });
});
