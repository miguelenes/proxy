/**
 * Trestle integration configuration types.
 * @packageDocumentation
 */

import { getMeshDataDir } from "./paths.js";

export interface MeshConfig {
  /** Enable local knowledge capture (default: true) */
  enabled: boolean;
  /** Opt-in to share knowledge with mesh (default: false) */
  contribute: boolean;
  /** Mesh server URL */
  meshUrl: string;
  /** Sync interval in ms (default: 300000 = 5 min) */
  syncIntervalMs: number;
  /** Context injection interval in ms (default: 900000 = 15 min) */
  injectIntervalMs: number;
  /** Data directory for mesh SQLite DB */
  dataDir: string;
}

export const DEFAULT_MESH_CONFIG: MeshConfig = {
  enabled: true,
  contribute: false,
  meshUrl: "https://osmosis-mesh-dev.fly.dev",
  syncIntervalMs: 300_000,
  injectIntervalMs: 900_000,
  dataDir: getMeshDataDir(),
};

export interface ResponseCacheConfig {
  enabled: boolean;
  maxSizeMb: number;
  defaultTtlSeconds: number;
  ttlByTaskType?: Record<string, number>;
  onlyWhenDeterministic: boolean;
}

export interface TrestleConfig {
  enabled: boolean;
  /** Proxy URL (default: http://127.0.0.1:4100) */
  proxyUrl?: string;
  circuitBreaker?: {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    requestTimeoutMs?: number;
  };
  autoStart?: boolean;
  mesh?: Partial<MeshConfig>;
  cache?: Partial<ResponseCacheConfig>;
}

/** @deprecated Use TrestleConfig */
export type RelayPlaneConfig = TrestleConfig;

export const DEFAULT_TRESTLE_CONFIG: Required<TrestleConfig> = {
  enabled: false,
  proxyUrl: "http://127.0.0.1:4100",
  circuitBreaker: {
    failureThreshold: 3,
    resetTimeoutMs: 30_000,
    requestTimeoutMs: 3_000,
  },
  autoStart: true,
  mesh: { ...DEFAULT_MESH_CONFIG },
  cache: {
    enabled: true,
    maxSizeMb: 100,
    defaultTtlSeconds: 3600,
    onlyWhenDeterministic: true,
  },
};

/** @deprecated Use DEFAULT_TRESTLE_CONFIG */
export const DEFAULT_RELAY_CONFIG = DEFAULT_TRESTLE_CONFIG;

export function resolveConfig(
  partial?: Partial<TrestleConfig>,
): Required<TrestleConfig> {
  if (!partial) return { ...DEFAULT_TRESTLE_CONFIG };
  return {
    enabled: partial.enabled ?? DEFAULT_TRESTLE_CONFIG.enabled,
    proxyUrl: partial.proxyUrl ?? DEFAULT_TRESTLE_CONFIG.proxyUrl,
    circuitBreaker: {
      ...DEFAULT_TRESTLE_CONFIG.circuitBreaker,
      ...partial.circuitBreaker,
    },
    autoStart: partial.autoStart ?? DEFAULT_TRESTLE_CONFIG.autoStart,
    mesh: { ...DEFAULT_MESH_CONFIG, ...partial.mesh },
    cache: { ...DEFAULT_TRESTLE_CONFIG.cache, ...partial.cache },
  };
}

export function resolveMeshConfig(partial?: Partial<MeshConfig>): MeshConfig {
  return { ...DEFAULT_MESH_CONFIG, ...partial };
}
