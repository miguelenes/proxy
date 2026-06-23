/**
 * HTTP header helpers for Trestle branding with legacy Trestle mirror.
 * @packageDocumentation
 */

import { BRAND } from "./constants.js";

const warnedLegacyEnv = new Set<string>();

export function warnLegacyEnv(name: string, replacement: string): void {
  if (warnedLegacyEnv.has(name)) return;
  warnedLegacyEnv.add(name);
  console.warn(`${BRAND.logPrefix} ${name} is deprecated; use ${replacement}`);
}

export function legacyHeadersEnabled(): boolean {
  const v = process.env[BRAND.env.legacyHeaders];
  if (v === "0" || v === "false") return false;
  return true;
}

/** Build canonical x-trestle-* headers, optionally mirroring x-relayplane-* */
export function buildBrandHeaders(
  entries: Record<string, string>,
  options?: { titleCase?: boolean },
): Record<string, string> {
  const titleCase = options?.titleCase ?? false;
  const prefix = titleCase ? BRAND.headers.prefixTitle : BRAND.headers.prefix;
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(entries)) {
    const suffix = key.startsWith("x-") ? key.slice(2) : key;
    const canonicalKey = `${prefix}${suffix}`;
    out[canonicalKey] = value;

    if (legacyHeadersEnabled()) {
      const legacyPrefix = titleCase
        ? BRAND.legacyHeaders.prefixTitle
        : BRAND.legacyHeaders.prefix;
      out[`${legacyPrefix}${suffix}`] = value;
    }
  }

  return out;
}

export function trestleHeader(name: string): string {
  const suffix = name.replace(/^x-trestle-/, "").replace(/^X-Trestle-/, "");
  return `${BRAND.headers.prefix}${suffix}`;
}

export function readBrandHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const suffix = name.replace(/^x-trestle-/, "").replace(/^x-relayplane-/, "");
  const keys = [
    `${BRAND.headers.prefix}${suffix}`,
    `${BRAND.legacyHeaders.prefix}${suffix}`,
    name,
  ];
  for (const k of keys) {
    const v = headers[k] ?? headers[k.toLowerCase()];
    if (v === undefined) continue;
    return Array.isArray(v) ? v[0] : v;
  }
  return undefined;
}
