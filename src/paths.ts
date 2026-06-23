/**
 * Trestle config/data path resolution and legacy ~/.trestle migration.
 * @packageDocumentation
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BRAND, brandLog } from "./brand/constants.js";
import { warnLegacyEnv } from "./brand/headers.js";

let migrationDone = false;

function homeBase(): string {
  const trestleOverride = process.env[BRAND.env.homeOverride]?.trim();
  if (trestleOverride) return trestleOverride;

  const legacyOverride = process.env[BRAND.legacyEnv.homeOverride]?.trim();
  if (legacyOverride) {
    warnLegacyEnv(BRAND.legacyEnv.homeOverride, BRAND.env.homeOverride);
    return legacyOverride;
  }

  return os.homedir();
}

export function getLegacyConfigDir(): string {
  return path.join(homeBase(), BRAND.legacyConfigDirName);
}

export function getConfigDir(): string {
  return path.join(homeBase(), BRAND.configDirName);
}

export function getConfigPath(): string {
  const trestlePath = process.env[BRAND.env.configPath]?.trim();
  if (trestlePath) return trestlePath;

  const legacyPath = process.env[BRAND.legacyEnv.configPath]?.trim();
  if (legacyPath) {
    warnLegacyEnv(BRAND.legacyEnv.configPath, BRAND.env.configPath);
    return legacyPath;
  }

  return path.join(getConfigDir(), "config.json");
}

export function getPolicyPath(): string {
  return path.join(getConfigDir(), "policy.yaml");
}

export function getCredentialsPath(): string {
  return path.join(getConfigDir(), "credentials.json");
}

export function getTracesDir(): string {
  return path.join(getConfigDir(), "traces");
}

export function getTelemetryDir(): string {
  return path.join(getConfigDir(), "telemetry");
}

export function getMeshDataDir(): string {
  return path.join(getConfigDir(), "mesh");
}

export function getStatsPath(): string {
  return path.join(getConfigDir(), "stats.json");
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * One-time migration: ~/.relayplane → ~/.trestle when target is missing.
 */
export function maybeMigrateLegacyConfigDir(): void {
  if (migrationDone) return;
  migrationDone = true;

  const target = getConfigDir();
  const legacy = getLegacyConfigDir();

  if (fs.existsSync(target) || !fs.existsSync(legacy)) return;

  try {
    copyDirRecursive(legacy, target);
    brandLog(
      `Migrated data from ~/${BRAND.legacyConfigDirName}/ to ~/${BRAND.configDirName}/`,
    );
  } catch (err) {
    console.warn(
      `${BRAND.logPrefix} Failed to migrate legacy config dir: ${(err as Error).message}`,
    );
  }
}

export function ensureConfigDirExists(): void {
  maybeMigrateLegacyConfigDir();
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
