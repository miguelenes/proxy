/**
 * Google ADK / Antigravity / AGY provider tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { resolveGoogleApiKey, mapGoogleError } from '../src/providers/google-shared.js';
import { adkPing } from '../src/providers/google-adk.js';
import { ANTIGRAVITY_DEFAULTS } from '../src/providers/antigravity.js';
import { AGY_DEFAULTS } from '../src/providers/agy.js';
import { resolveExplicitModel } from '../src/standalone-proxy.js';

describe('resolveGoogleApiKey', () => {
  it('reads GEMINI_API_KEY', () => {
    const prev = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini-key';
    expect(resolveGoogleApiKey()).toBe('gemini-key');
    process.env.GEMINI_API_KEY = prev;
  });

  it('falls back to GOOGLE_API_KEY', () => {
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevGoogle = process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_API_KEY = 'google-key';
    expect(resolveGoogleApiKey()).toBe('google-key');
    process.env.GEMINI_API_KEY = prevGemini;
    process.env.GOOGLE_API_KEY = prevGoogle;
  });
});

describe('mapGoogleError', () => {
  it('maps unauthorized', () => {
    const mapped = mapGoogleError(new Error('401 Unauthorized'));
    expect(mapped.status).toBe(401);
  });
});

describe('adkPing', () => {
  it('returns adk version', () => {
    const ping = adkPing();
    expect(ping.ok).toBe(true);
    expect(ping.adkVersion.length).toBeGreaterThan(0);
  });
});

describe('defaults', () => {
  it('antigravity default agent', () => {
    expect(ANTIGRAVITY_DEFAULTS.defaultAgent).toBe('antigravity-preview-05-2026');
  });
  it('agy app name', () => {
    expect(AGY_DEFAULTS.appName).toBe('relayplane-agy');
  });
});

describe('resolveExplicitModel google clients', () => {
  it('resolves antigravity prefix', () => {
    expect(resolveExplicitModel('antigravity/antigravity-preview-05-2026')?.provider).toBe('antigravity');
  });
  it('resolves agy prefix', () => {
    expect(resolveExplicitModel('agy/gemini-2.5-flash')?.provider).toBe('agy');
  });
});
