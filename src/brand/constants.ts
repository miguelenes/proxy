/**
 * Trestle brand constants — single source of truth for naming.
 * @packageDocumentation
 */

export const BRAND = {
  name: "Trestle",
  legalName: "Trestle Proxy",
  logPrefix: "[Trestle]",
  configDirName: ".trestle",
  legacyConfigDirName: ".relayplane",
  cli: "trestle",
  cliAlias: "trestle-proxy",
  npmPackage: "@trestle/proxy",
  defaultPort: 4100,
  env: {
    configPath: "TRESTLE_CONFIG_PATH",
    homeOverride: "TRESTLE_HOME_OVERRIDE",
    qualityModel: "TRESTLE_QUALITY_MODEL",
    legacyHeaders: "TRESTLE_LEGACY_HEADERS",
    apiUrl: "TRESTLE_API_URL",
  },
  legacyEnv: {
    configPath: "RELAYPLANE_CONFIG_PATH",
    homeOverride: "RELAYPLANE_HOME_OVERRIDE",
    apiUrl: "RELAYPLANE_API_URL",
  },
  headers: {
    prefix: "x-trestle-",
    prefixTitle: "X-Trestle-",
  },
  legacyHeaders: {
    prefix: "x-relayplane-",
    prefixTitle: "X-RelayPlane-",
  },
  relayHeaders: {
    prefix: "x-relay-",
    prefixTitle: "X-Relay-",
  },
  trestleRelayHeaders: {
    prefix: "x-trestle-",
    prefixTitle: "X-Trestle-",
  },
  aliases: {
    long: "trestle:",
    short: "tr:",
  },
  legacyAliases: {
    long: "relayplane:",
    short: "rp:",
  },
} as const;

export function logPrefix(): string {
  return BRAND.logPrefix;
}

export function brandLog(message: string): void {
  console.log(`${BRAND.logPrefix} ${message}`);
}

export function brandWarn(message: string): void {
  console.warn(`${BRAND.logPrefix} ${message}`);
}
