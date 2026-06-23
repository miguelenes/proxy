import { loadConfig, saveConfig } from "../config.js";

// This function needs to exist somewhere to get the current proxy version.
// Assuming it's in a utils or version file.
function getVersion(): string {
  try {
    const pkg = require("../../package.json");
    return pkg.version || "unknown";
  } catch {
    return "unknown";
  }
}

const PING_ENDPOINT = "https://relayplane.com/api/v1/ping";

interface PingPayload {
  v: string;
  event: "startup" | "dashboard";
  did: string;
}

function isDayElapsed(lastPing?: string): boolean {
  if (!lastPing) return true;
  const lastDate = new Date(lastPing);
  const today = new Date();
  lastDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return today.getTime() > lastDate.getTime();
}

function isHourElapsed(lastPing?: string): boolean {
  if (!lastPing) return true;
  const oneHour = 60 * 60 * 1000;
  return new Date().getTime() - new Date(lastPing).getTime() > oneHour;
}

export async function sendPing(_event: "startup" | "dashboard"): Promise<void> {
  // Trestle is local-only — cloud pings disabled
}
