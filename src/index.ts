/**
 * @trestle/proxy
 *
 * Trestle Agent Ops Proxy Server
 *
 * Intelligent AI model routing with integrated observability.
 * This is a standalone proxy that routes requests to optimal models
 * based on task type and cost optimization.
 *
 * @example
 * ```typescript
 * import { startProxy } from '@trestle/proxy';
 *
 * // Start the proxy server
 * await startProxy({ port: 4801 });
 * ```
 *
 * @packageDocumentation
 */

// Standalone proxy (requires only @relayplane/core)
export { startProxy } from "./standalone-proxy.js";
export type { ProxyConfig } from "./standalone-proxy.js";

// Configuration
export {
  loadConfig,
  saveConfig,
  updateConfig,
  isFirstRun,
  markFirstRunComplete,
  isTelemetryEnabled,
  enableTelemetry,
  disableTelemetry,
  getDeviceId,
  setApiKey,
  getApiKey,
  getConfigDir,
  getConfigPath,
} from "./config.js";
export type { ProxyConfig as ProxyLocalConfig } from "./config.js";

// Telemetry
export {
  recordTelemetry,
  inferTaskType,
  estimateCost,
  setAuditMode,
  isAuditMode,
  setOfflineMode,
  isOfflineMode,
  getAuditBuffer,
  clearAuditBuffer,
  getLocalTelemetry,
  getTelemetryStats,
  clearTelemetry,
  getTelemetryPath,
  printTelemetryDisclosure,
} from "./observability/telemetry.js";
export type { TelemetryEvent } from "./observability/telemetry.js";

// Sandbox Architecture (v1.3.0+)
export { CircuitBreaker, CircuitState } from "./circuit-breaker.js";
export {
  TrestleMiddleware,
  TrestleMiddleware as RelayPlaneMiddleware,
} from "./middleware.js";
export type { MiddlewareOptions } from "./middleware.js";
export { ProcessManager } from "./process-manager.js";
export { handleHealthRequest, probeHealth } from "./health.js";
export { StatsCollector } from "./observability/stats.js";
export { StatusReporter } from "./status.js";
export type { ProxyStatus } from "./status.js";
export { resolveConfig } from "./trestle-config.js";
export type { TrestleConfig, RelayPlaneConfig } from "./trestle-config.js";
export { defaultLogger } from "./logger.js";
export type { Logger } from "./logger.js";

// Proxy stats collector (from standalone proxy)
export { proxyStatsCollector } from "./standalone-proxy.js";

// Ollama local model provider
export {
  checkOllamaHealth,
  checkOllamaHealthCached,
  clearOllamaHealthCache,
  shouldRouteToOllama,
  resolveOllamaModel,
  forwardToOllama,
  forwardToOllamaStream,
  convertMessagesToOllama,
  buildOllamaRequest,
  convertOllamaResponse,
  convertOllamaStreamChunk,
  mapCloudModelToOllama,
  OLLAMA_DEFAULTS,
  CLOUD_TO_OLLAMA_MODEL_MAP,
} from "./providers/ollama.js";
export type {
  OllamaProviderConfig,
  OllamaHealthResult,
} from "./providers/ollama.js";

export {
  DEFAULT_ENDPOINTS,
  getProviderEndpoint,
  isOpenAiCompatibleProvider,
} from "./providers/index.js";
export type {
  ProviderEndpoint,
  ProvidersConfigMap,
} from "./providers/index.js";
export {
  responsesToChatRequest,
  chatCompletionToResponse,
} from "./api/responses.js";
export {
  forwardToDevin,
  DEVIN_DEFAULTS,
  devinAuthHeaders,
  buildDevinUrl,
  buildDevinOrgUrl,
  buildPaginationQuery,
  mapDevinError,
  devinSelf,
  devinListSessions,
  devinCreateSession,
  devinGetSession,
  devinListNotes,
  devinListPlaybooks,
  devinListSecrets,
  devinListSchedules,
  devinMetricsUsageOrg,
  devinConsumptionDaily,
} from "./providers/devin.js";
export type {
  DevinProviderConfig,
  DevinPaginatedResponse,
  DevinPaginationOpts,
} from "./providers/devin.js";
export {
  ZAI_DEFAULTS,
  ZAI_MODELS,
  isZaiThinkingCapable,
  isZaiVisionModel,
  mapZaiUsage,
  mapZaiError,
  forwardToZaiChat,
  forwardToZaiChatStream,
  getZaiAsyncResult,
} from "./providers/zai.js";
export type { ZaiUsage, NormalizedZaiUsage } from "./providers/zai.js";
export {
  OLLAMA_CLOUD_DEFAULTS,
  OLLAMA_CLOUD_MODELS,
  stripCloudSuffix,
  isOllamaCloudModel,
  supportsThink,
  mapOllamaUsage,
  mapOllamaCloudError,
  forwardToOllamaCloudChat,
  forwardToOllamaCloudChatStream,
  ollamaCloudGenerate,
  ollamaCloudEmbed,
  ollamaCloudListModels,
  ollamaCloudListRunning,
  ollamaCloudShowModel,
  ollamaCloudVersion,
  ollamaCloudAnthropicMessages,
} from "./providers/ollama-cloud.js";
export type {
  OllamaUsage,
  NormalizedOllamaUsage,
} from "./providers/ollama-cloud.js";
export {
  NVIDIA_DEFAULTS,
  NVIDIA_MODELS,
  isNvidiaThinkingModel,
  isNvidiaVisionModel,
  mapNvidiaUsage,
  mapNvidiaError,
  forwardToNvidiaChat,
  forwardToNvidiaChatStream,
  nvidiaEmbed,
  nvidiaRank,
  nvidiaListModels,
} from "./providers/nvidia.js";
export type { NvidiaUsage } from "./providers/nvidia.js";
export {
  CURSOR_DEFAULTS,
  cursorBasicAuthHeaders,
  buildCursorUrl,
  isAllowedCursorPath,
  mapCursorError,
  cursorRequest,
  cursorTeamMembers,
  cursorAnalyticsDau,
  cursorAiCodeCommits,
  cursorAiCodeChanges,
} from "./providers/cursor.js";
export type {
  CursorProviderConfig,
  CursorRequestOpts,
} from "./providers/cursor.js";
export {
  COPILOT_DEFAULTS,
  resolveCopilotToken,
  resolveCopilotTokenFromBearer,
  mapCopilotError,
  extractCopilotPrompt,
  forwardToCopilotChat,
  forwardToCopilotChatStream,
  copilotPing,
  copilotListSessions,
  copilotCreateSession,
  copilotResumeSession,
  copilotDeleteSession,
  copilotSendAndWait,
  copilotGetEvents,
  copilotAbort,
} from "./providers/copilot.js";
export type { CopilotProviderConfig } from "./providers/copilot.js";
export {
  KIMI_DEFAULTS,
  resolveKimiApiKey,
  resolveKimiBaseUrl,
  mapKimiUsage,
  mapKimiError,
  forwardToKimiChat,
  forwardToKimiChatStream,
  kimiGetBalance,
  kimiListModels,
  kimiEstimateTokens,
  kimiPing,
} from "./providers/kimi.js";
export type { KimiProviderConfig, KimiRegion } from "./providers/kimi.js";
export {
  KIMI_AGENT_DEFAULTS,
  isKimiCliAvailable,
  mapKimiAgentError,
  forwardToKimiAgentChat,
  forwardToKimiAgentChatStream,
  kimiAgentPing,
  kimiAgentListSessions,
  kimiAgentCreateSession,
  kimiAgentGetSessionEvents,
  kimiAgentDeleteSession,
  kimiAgentSessionPrompt,
} from "./providers/kimi-agent.js";
export type { KimiAgentProviderConfig } from "./providers/kimi-agent.js";
export {
  QWEN_DEFAULTS,
  resolveQwenApiKey,
  resolveQwenBaseUrl,
  mapQwenUsage,
  mapQwenError,
  applyQwenThinkingDefaults,
  forwardToQwenChat,
  forwardToQwenChatStream,
  qwenListModels,
  qwenPing,
} from "./providers/qwen.js";
export type { QwenProviderConfig, QwenRegion } from "./providers/qwen.js";
export {
  QWEN_AGENT_DEFAULTS,
  mapQwenAgentError,
  forwardToQwenAgentChat,
  forwardToQwenAgentChatStream,
  qwenAgentPing,
  qwenAgentStartSession,
  qwenAgentSessionPrompt,
  qwenAgentCloseSession,
} from "./providers/qwen-agent.js";
export type { QwenAgentProviderConfig } from "./providers/qwen-agent.js";
export {
  OPENROUTER_DEFAULTS,
  resolveOpenRouterToken,
  mapOpenRouterError,
  mapOpenRouterUsage,
  forwardToOpenRouterChat,
  forwardToOpenRouterChatStream,
  openRouterListModels,
  openRouterGetCredits,
  openRouterGetGeneration,
} from "./providers/openrouter.js";
export type { OpenRouterProviderConfig } from "./providers/openrouter.js";
export {
  OPENCODE_ZEN_DEFAULTS,
  parseOpencodeModelName,
  resolveOpencodeProtocol,
  buildOpencodeUpstreamUrl,
  resolveOpencodeZenToken,
  forwardToOpencodeZenChat,
  listOpencodeZenModels,
} from "./providers/opencode-zen.js";
export {
  OPENCODE_GO_DEFAULTS,
  resolveOpencodeGoToken,
  forwardToOpencodeGoChat,
  listOpencodeGoModels,
} from "./providers/opencode-go.js";
export {
  OPENCODE_SERVER_DEFAULTS,
  opencodePing,
  opencodeListSessions,
  opencodeSessionPrompt,
} from "./providers/opencode.js";
export type { OpencodeZenProviderConfig } from "./providers/opencode-zen.js";
export type { OpencodeGoProviderConfig } from "./providers/opencode-go.js";
export type { OpencodeServerProviderConfig } from "./providers/opencode.js";
export {
  resolveGoogleApiKey,
  adkPing,
  forwardToGoogleAdkChat,
  GOOGLE_ADK_DEFAULTS,
} from "./providers/google-adk.js";
export {
  forwardToAntigravityChat,
  ANTIGRAVITY_DEFAULTS,
} from "./providers/antigravity.js";
export { forwardToAgyChat, AGY_DEFAULTS } from "./providers/agy.js";
export {
  forwardAzureFoundry,
  forwardToFoundryChat,
  forwardToFoundryResponses,
  foundryPing,
  FOUNDRY_DEFAULTS,
  isFoundrySdkMode,
} from "./providers/azure-foundry.js";
export type { GoogleAdkProviderConfig } from "./providers/google-adk.js";
export type { AntigravityProviderConfig } from "./providers/antigravity.js";
export type { AgyProviderConfig } from "./providers/agy.js";
export type { AzureFoundryProviderConfig } from "./providers/azure-foundry.js";

// Re-export core types
export type { Provider, TaskType } from "@relayplane/core";

// Adaptive Provider Recovery (Phase 1)
export {
  RecoveryEngine,
  RecoveryPatternStore,
  FailureObserver,
  PatternApplicator,
} from "./recovery.js";
export type {
  RecoveryConfig,
  RecoveryPattern,
  RecoveryPatternType,
  RecoveryResult,
  RecoveryEvent,
  FailureContext,
  RequestOverrides,
} from "./recovery.js";

// Advanced proxy server (requires @relayplane/ledger, @relayplane/auth-gate, etc.)
export {
  ProxyServer,
  createProxyServer,
  createSandboxedProxyServer,
} from "./server.js";
export type { ProxyServerConfig } from "./server.js";

// Tool Router — deny-by-default tool authorization (Phase 2, Session 3)
export {
  ToolRouter,
  getToolRouter,
  resetToolRouter,
  extractToolContext,
  BUILTIN_PACKS,
  DEFAULT_TOOL_ROUTER_CONFIG,
} from "./tool-router.js";
export type {
  ToolEntry,
  ToolPack,
  ToolRateLimit,
  AgentAuthConfig,
  ToolAuthContext,
  ToolAuthResult,
  ToolRouterConfig,
  ToolSchema,
  RateLimitCheckResult,
} from "./tool-router.js";
