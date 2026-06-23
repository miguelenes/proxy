/**
 * Trestle Proxy Telemetry
 *
 * Anonymized telemetry collection for improving model routing.
 *
 * What we collect (exact schema):
 * - device_id: anonymous random ID
 * - task_type: inferred from token patterns, NOT prompt content
 * - model: which model was used
 * - tokens_in/out: token counts
 * - latency_ms: response time
 * - success: whether request succeeded
 * - cost_usd: estimated cost
 *
 * What we NEVER collect:
 * - Prompts or responses
 * - File paths or contents
 * - Anything that could identify you or your project
 *
 * @packageDocumentation
 */

import * as fs from "fs";
import * as path from "path";
import { getDeviceId, isTelemetryEnabled, getConfigDir } from "../config.js";

/**
 * Telemetry event schema (matches PITCH-v2.md)
 */
export interface TelemetryEvent {
  /** Anonymous device ID */
  device_id: string;

  /** Inferred task type (from token patterns, NOT prompt content) */
  task_type: string;

  /** Model used */
  model: string;

  /** Input tokens */
  tokens_in: number;

  /** Output tokens */
  tokens_out: number;

  /** Request latency in milliseconds */
  latency_ms: number;

  /** Whether request succeeded */
  success: boolean;

  /** Estimated cost in USD (actual cost paid on the routed model, for backward compatibility) */
  cost_usd: number;

  /** Actual cost paid on the routed model (same as cost_usd; explicit field for cloud savings split) */
  actual_cost_usd?: number;

  /** Baseline cost — what the same request would cost on Claude Opus 4 at full price (no cache discount) */
  baseline_cost_usd?: number;

  /** Timestamp */
  timestamp: string;

  /** Original requested model (before routing) */
  requested_model?: string;

  /** Anthropic prompt caching: tokens used to create new cache entries */
  cache_creation_tokens?: number;

  /** Anthropic prompt caching: tokens read from cache */
  cache_read_tokens?: number;
}

/**
 * Local telemetry store using SQLite (via Ledger)
 */
const TELEMETRY_FILE = path.join(getConfigDir(), "telemetry.jsonl");

// In-memory buffer for audit mode
let auditBuffer: TelemetryEvent[] = [];
let auditMode = false;
let offlineMode = false;

/**
 * Task type inference based on token patterns
 * This infers task type from request characteristics, NOT from prompt content
 */
export function inferTaskType(
  inputTokens: number,
  outputTokens: number,
  model: string,
  hasTools: boolean = false,
): string {
  // Simple heuristics based on token patterns
  const ratio = outputTokens / Math.max(inputTokens, 1);

  if (hasTools) {
    return "tool_use";
  }

  if (inputTokens > 10000) {
    return "long_context";
  }

  if (ratio > 5) {
    return "generation";
  }

  if (ratio < 0.3 && outputTokens < 100) {
    return "classification";
  }

  if (inputTokens < 500 && outputTokens < 500) {
    return "quick_task";
  }

  if (inputTokens > 2000 && outputTokens > 500) {
    return "code_review";
  }

  if (outputTokens > 1000) {
    return "content_generation";
  }

  return "general";
}

/**
 * Estimate cost based on model and token counts
 * Pricing as of 2024 (USD per 1M tokens)
 */
export interface ModelPrice {
  input: number;
  output: number;
  cacheHit?: number;
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Anthropic — versioned IDs
  "claude-opus-4-20250514": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-3-7-sonnet-20250219": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet-20240620": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  "claude-3-opus-20240229": { input: 15.0, output: 75.0 },
  "claude-3-sonnet-20240229": { input: 3.0, output: 15.0 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  // Anthropic — generation-versioned aliases (e.g. claude-opus-4-6 = Opus 4 snapshot 6)
  "claude-opus-4-6": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-6": { input: 0.8, output: 4.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
  // Anthropic — -latest aliases (resolve to same tier)
  "claude-opus-4-latest": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-latest": { input: 3.0, output: 15.0 },
  "claude-3-7-sonnet-latest": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet-latest": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku-latest": { input: 0.8, output: 4.0 },
  "claude-3-haiku-latest": { input: 0.25, output: 1.25 },
  // Anthropic — short aliases used in proxy MODEL_MAPPING
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-haiku-4": { input: 0.8, output: 4.0 },
  "claude-3-7-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-5-haiku": { input: 0.8, output: 4.0 },

  // OpenAI
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },

  // Google
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },

  // DeepSeek — v4 flash/pro with KV cache hit pricing
  "deepseek-v4-flash": { input: 0.14, output: 0.28, cacheHit: 0.0028 },
  "deepseek-v4-pro": { input: 0.435, output: 0.87, cacheHit: 0.003625 },
  "deepseek-chat": { input: 0.14, output: 0.28, cacheHit: 0.0028 },
  "deepseek-reasoner": { input: 0.435, output: 0.87, cacheHit: 0.003625 },

  // Mistral
  "mistral-small-latest": { input: 0.2, output: 0.6 },
  "mistral-large-latest": { input: 2.0, output: 6.0 },
  "codestral-latest": { input: 0.3, output: 0.9 },

  // z.ai / GLM — text models with cache-hit pricing (~10% of input)
  "glm-5.2": { input: 0.6, output: 2.0, cacheHit: 0.06 },
  "glm-5.1": { input: 0.4, output: 1.5, cacheHit: 0.04 },
  "glm-5-turbo": { input: 0.2, output: 0.8, cacheHit: 0.02 },
  "glm-5": { input: 0.5, output: 1.5, cacheHit: 0.05 },
  "glm-4.7": { input: 0.4, output: 1.5, cacheHit: 0.04 },
  "glm-4.7-flash": { input: 0.1, output: 0.3, cacheHit: 0.01 },
  "glm-4.7-flashx": { input: 0.05, output: 0.15, cacheHit: 0.005 },
  "glm-4.6": { input: 0.3, output: 1.2, cacheHit: 0.03 },
  "glm-4.5": { input: 0.2, output: 0.8, cacheHit: 0.02 },
  "glm-4.5-air": { input: 0.1, output: 0.4, cacheHit: 0.01 },
  "glm-4.5-x": { input: 0.2, output: 0.8, cacheHit: 0.02 },
  "glm-4.5-airx": { input: 0.1, output: 0.4, cacheHit: 0.01 },
  "glm-4.5-flash": { input: 0.05, output: 0.2, cacheHit: 0.005 },
  "glm-4-32b-0414-128k": { input: 0.1, output: 0.4, cacheHit: 0.01 },
  // z.ai vision
  "glm-5v-turbo": { input: 0.2, output: 0.8 },
  "glm-4.6v": { input: 0.15, output: 0.6 },
  "glm-4.6v-flash": { input: 0.08, output: 0.3 },
  "glm-4.6v-flashx": { input: 0.05, output: 0.2 },
  "glm-4.5v": { input: 0.1, output: 0.4 },
  "autoglm-phone-multilingual": { input: 0.15, output: 0.6 },
  // z.ai image / video / audio / OCR (per-call estimates)
  "glm-image": { input: 0, output: 0.03 },
  "cogview-4-250304": { input: 0, output: 0.03 },
  "cogvideox-3": { input: 0, output: 0.2 },
  "vidu-q1": { input: 0, output: 0.2 },
  "vidu-q2": { input: 0, output: 0.2 },
  "glm-asr-2512": { input: 0.01, output: 0.02 },
  "glm-ocr": { input: 0.02, output: 0.04 },

  // NVIDIA NIM (approximate — credit-pool pricing; override in telemetry config if needed)
  "nvidia/nemotron-mini-4b-instruct": { input: 0.05, output: 0.1 },
  "nvidia/nvidia-nemotron-nano-9b-v2": { input: 0.08, output: 0.2 },
  "nvidia/nemotron-3-nano-30b-a3b": { input: 0.15, output: 0.45 },
  "nvidia/nemotron-3-super-120b-a12b": { input: 0.5, output: 1.5 },
  "nvidia/nemotron-3-ultra-550b-a55b": { input: 1.2, output: 3.6 },
  "nvidia/llama-3.1-nemotron-nano-8b-v1": { input: 0.1, output: 0.3 },
  "nvidia/llama-3.3-nemotron-super-49b-v1": { input: 0.3, output: 0.9 },
  "nvidia/llama-3.3-nemotron-super-49b-v1.5": { input: 0.3, output: 0.9 },
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": { input: 0.8, output: 2.4 },
  "meta/llama-3.1-8b-instruct": { input: 0.05, output: 0.1 },
  "meta/llama-3.1-70b-instruct": { input: 0.35, output: 0.4 },
  "meta/llama-3.3-70b-instruct": { input: 0.35, output: 0.4 },
  "qwen/qwen3-coder-480b-a35b-instruct": { input: 0.3, output: 1.2 },
  "qwen/qwen3-next-80b-a3b-thinking": { input: 0.2, output: 0.8 },
  // Qwen / DashScope cloud (compatible-mode)
  "qwen-plus": { input: 0.4, output: 1.2, cacheHit: 0.04 },
  "qwen-max": { input: 1.6, output: 6.4, cacheHit: 0.16 },
  "qwen-turbo": { input: 0.05, output: 0.2, cacheHit: 0.005 },
  "qwen3.5-plus": { input: 0.5, output: 1.5, cacheHit: 0.05 },
  "qwen3-max": { input: 1.6, output: 6.4, cacheHit: 0.16 },
  "qwen3-turbo": { input: 0.05, output: 0.2, cacheHit: 0.005 },
  "qwen/qwen-plus": { input: 0.4, output: 1.2, cacheHit: 0.04 },
  "qwen/qwen-max": { input: 1.6, output: 6.4, cacheHit: 0.16 },
  "qwen/qwen-turbo": { input: 0.05, output: 0.2, cacheHit: 0.005 },
  "qwen/qwen3.5-plus": { input: 0.5, output: 1.5, cacheHit: 0.05 },
  "moonshotai/kimi-k2-thinking": { input: 0.5, output: 1.5 },
  "deepseek-ai/deepseek-v4-pro": { input: 0.3, output: 1.2 },
  "openai/gpt-oss-120b": { input: 0.5, output: 1.5 },
  "nvidia/llama-3.2-nv-embedqa-1b-v2": { input: 0.02, output: 0 },
  "nvidia/nv-embedqa-e5-v5": { input: 0.02, output: 0 },
  "baai/bge-m3": { input: 0.02, output: 0 },
  "nvidia/llama-3.2-nemoretriever-rerankqa-1b-v2": { input: 0.04, output: 0 },
  "nvidia/llama-3-2-nemoretriever-rerankqa-500m": { input: 0.03, output: 0 },

  // Ollama Cloud (approximate — subscription pricing; override in telemetry config if needed)
  "gpt-oss:20b": { input: 0.1, output: 0.3 },
  "gpt-oss:120b": { input: 0.5, output: 1.5 },
  "gpt-oss:120b-cloud": { input: 0.5, output: 1.5 },
  "deepseek-v3.1:671b": { input: 0.3, output: 1.2 },
  "qwen3-coder:480b": { input: 0.3, output: 1.2 },
  "qwen3-vl:235b": { input: 0.2, output: 0.8 },
  "kimi-k2:1t": { input: 0.5, output: 1.5 },
  "kimi-k2.6": { input: 0.5, output: 1.5, cacheHit: 0.05 },
  "kimi-k2-thinking": { input: 0.6, output: 2.0, cacheHit: 0.06 },
  "kimi-k2-thinking-turbo": { input: 0.3, output: 1.0, cacheHit: 0.03 },
  "kimi-latest": { input: 0.5, output: 1.5 },
  "minimax-m2:230b": { input: 0.2, output: 0.8 },
  "glm-4.6:cloud": { input: 0.3, output: 1.2 },
  embeddinggemma: { input: 0.02, output: 0 },
  "nomic-embed-text": { input: 0.02, output: 0 },
  "mxbai-embed-large": { input: 0.02, output: 0 },

  // Default for unknown models
  default: { input: 1.0, output: 3.0 },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens?: number,
  cacheReadTokens?: number,
  cacheHitTokens?: number,
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["default"];
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  if (cacheHitTokens !== undefined && pricing.cacheHit !== undefined) {
    const hit = cacheHitTokens;
    const miss = inputTokens;
    return (
      (miss / 1_000_000) * pricing.input +
      (hit / 1_000_000) * pricing.cacheHit +
      outputCost
    );
  }

  if (cacheCreationTokens || cacheReadTokens) {
    // Anthropic: input_tokens includes cache tokens, so subtract them for the base portion
    const creation = cacheCreationTokens ?? 0;
    const read = cacheReadTokens ?? 0;
    const baseInput = Math.max(0, inputTokens - creation - read);
    const regularInputCost = (baseInput / 1_000_000) * pricing.input;
    const cacheCreationCost = (creation / 1_000_000) * pricing.input * 1.25;
    const cacheReadCost = (read / 1_000_000) * pricing.input * 0.1;
    return regularInputCost + cacheCreationCost + cacheReadCost + outputCost;
  }

  // No cache breakdown — backward compatible
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  return inputCost + outputCost; // Full precision — rounding happens at display time
}

/**
 * Set audit mode - shows telemetry payload before sending
 */
export function setAuditMode(enabled: boolean): void {
  auditMode = enabled;
}

/**
 * Check if audit mode is enabled
 */
export function isAuditMode(): boolean {
  return auditMode;
}

/**
 * Set offline mode - disables all network calls except LLM
 */
export function setOfflineMode(enabled: boolean): void {
  offlineMode = enabled;
}

/**
 * Check if offline mode is enabled
 */
export function isOfflineMode(): boolean {
  return offlineMode;
}

/**
 * Get pending audit events
 */
export function getAuditBuffer(): TelemetryEvent[] {
  return [...auditBuffer];
}

/**
 * Clear audit buffer
 */
export function clearAuditBuffer(): void {
  auditBuffer = [];
}

/**
 * Record a telemetry event
 */
export function recordTelemetry(
  event: Omit<TelemetryEvent, "device_id" | "timestamp">,
): void {
  if (!isTelemetryEnabled() && !auditMode) {
    return; // Telemetry disabled and not in audit mode
  }

  const fullEvent: TelemetryEvent = {
    ...event,
    device_id: getDeviceId(),
    timestamp: new Date().toISOString(),
  };

  if (auditMode) {
    // In audit mode, buffer events and print them
    auditBuffer.push(fullEvent);
    console.log(
      "\n📊 [TELEMETRY AUDIT] The following data would be collected:",
    );
    console.log(JSON.stringify(fullEvent, null, 2));
    console.log("");
    return;
  }

  if (!isTelemetryEnabled()) {
    return;
  }

  // Store locally (append to JSONL file)
  try {
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.appendFileSync(TELEMETRY_FILE, JSON.stringify(fullEvent) + "\n");
  } catch (err) {
    // Silently fail - telemetry should never break the proxy
  }

  // Queue for cloud upload (if not offline)
  queueForUpload(fullEvent);
}

/**
 * Get local telemetry data
 */
export function getLocalTelemetry(): TelemetryEvent[] {
  try {
    if (!fs.existsSync(TELEMETRY_FILE)) {
      return [];
    }

    const data = fs.readFileSync(TELEMETRY_FILE, "utf-8");
    return data
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as TelemetryEvent);
  } catch (err) {
    return [];
  }
}

/**
 * Get telemetry stats summary
 */
export function getTelemetryStats(): {
  totalEvents: number;
  totalCost: number;
  baselineCost: number;
  savings: number;
  savingsPercent: number;
  byModel: Record<
    string,
    { count: number; cost: number; baselineCost: number }
  >;
  byTaskType: Record<string, { count: number; cost: number }>;
  successRate: number;
  savingsNote?: string;
} {
  const events = getLocalTelemetry();

  // Default baseline model: what you'd be paying without Trestle
  // Baseline = most recently used task-appropriate model
  const BASELINE_MODEL = "claude-opus-4-20250514"; // What you'd pay without routing

  const byModel: Record<
    string,
    { count: number; cost: number; baselineCost: number }
  > = {};
  const byTaskType: Record<string, { count: number; cost: number }> = {};
  let totalCost = 0;
  let totalBaselineCost = 0;
  let successCount = 0;

  for (const event of events) {
    totalCost += event.cost_usd;
    if (event.success) successCount++;

    // Calculate what this request would have cost on the baseline model
    const baselineForEvent = estimateCost(
      BASELINE_MODEL,
      event.tokens_in,
      event.tokens_out,
    );
    totalBaselineCost += baselineForEvent;

    if (!byModel[event.model]) {
      byModel[event.model] = { count: 0, cost: 0, baselineCost: 0 };
    }
    byModel[event.model].count++;
    byModel[event.model].cost += event.cost_usd;
    byModel[event.model].baselineCost += baselineForEvent;

    if (!byTaskType[event.task_type]) {
      byTaskType[event.task_type] = { count: 0, cost: 0 };
    }
    byTaskType[event.task_type].count++;
    byTaskType[event.task_type].cost += event.cost_usd;
  }

  const savings = totalBaselineCost - totalCost;
  const savingsPercent =
    totalBaselineCost > 0 ? (savings / totalBaselineCost) * 100 : 0;

  return {
    totalEvents: events.length,
    totalCost: Math.round(totalCost * 10000) / 10000,
    baselineCost: Math.round(totalBaselineCost * 10000) / 10000,
    savings: Math.round(savings * 10000) / 10000,
    savingsPercent: Math.round(savingsPercent * 10) / 10,
    byModel,
    byTaskType,
    successRate: events.length > 0 ? successCount / events.length : 0,
    savingsNote:
      "Baseline model: Claude Opus (input: $15/1M, output: $75/1M). " +
      "Actual routing selects cheaper models based on task complexity.",
  };
}

/**
 * Clear all local telemetry data
 */
export function clearTelemetry(): void {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      fs.unlinkSync(TELEMETRY_FILE);
    }
  } catch (err) {
    // Silently fail
  }
}

/**
 * Get telemetry file path
 */
export function getTelemetryPath(): string {
  return TELEMETRY_FILE;
}

// ============================================
// CLOUD TELEMETRY UPLOAD
// ============================================

const MESH_API_URL =
  process.env.TRESTLE_API_URL || "https://api.relayplane.com";
const UPLOAD_BATCH_SIZE = 50;
const FLUSH_DELAY_MS = 5000; // 5 second debounce

let uploadQueue: TelemetryEvent[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Queue an event for cloud upload
 */
export function queueForUpload(_event: TelemetryEvent): void {
  // Trestle is local-only — cloud upload disabled
}

export async function flushTelemetryToCloud(): Promise<void> {
  // Trestle is local-only — cloud upload disabled
}

/**
 * Get configured API key
 * Checks: 1) credentials.json (from `trestle login`), 2) config.json, 3) env var
 */
function getApiKey(): string | null {
  try {
    // Check credentials file first (from `trestle login`)
    const credPath = path.join(getConfigDir(), "credentials.json");
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      if (creds.apiKey) return creds.apiKey;
    }
  } catch {}
  try {
    const configPath = path.join(getConfigDir(), "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return config.apiKey || null;
    }
  } catch (err) {
    // Ignore config read errors
  }
  return process.env.RELAYPLANE_API_KEY || null;
}

/**
 * Stop upload timer (for cleanup)
 */
export function stopUploadTimer(): void {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  // Final flush on shutdown
  flushTelemetryToCloud().catch(() => {});
}

/**
 * Get number of events pending upload
 */
export function getPendingUploadCount(): number {
  return uploadQueue.length;
}

/**
 * Print telemetry disclosure message
 */
export function printTelemetryDisclosure(): void {
  console.log(`
╭─────────────────────────────────────────────────────────────────────╮
│                    ⚡ Trestle is running                          │
╰─────────────────────────────────────────────────────────────────────╯

Dashboard:        http://localhost:4100
Quickstart:       relayplane.com/docs/quickstart

To connect Claude Code:
  export ANTHROPIC_BASE_URL=http://localhost:4100

All routing and cost tracking happens locally on your machine.
Request content, models, tokens, and costs never leave your network.

Anonymous install + daily-session pings are sent so we can see whether
Trestle is growing. No request data. Opt out: trestle lifecycle off

`);
}
