/**
 * Google AGY provider — Antigravity-style coding agent via @google/adk.
 *
 * AGY (Antigravity CLI) workflows are exposed through ADK LlmAgent with search + code execution.
 * For managed sandbox agents, use the `antigravity` provider (Interactions API).
 *
 * @packageDocumentation
 */

import {
  forwardToGoogleAdkChat,
  forwardToGoogleAdkChatStream,
  GOOGLE_ADK_DEFAULTS,
  type GoogleAdkProviderConfig,
  mapGoogleAdkError,
  resolveGoogleApiKey,
  resolveGoogleApiKeyFromBearer,
  adkCreateSession,
  adkListSessions,
  adkGetSession,
  adkDeleteSession,
  adkRunSession,
  adkPing,
} from './google-adk.js';
import type { ChatRequestBody } from './shared.js';

export {
  resolveGoogleApiKey,
  resolveGoogleApiKeyFromBearer,
  adkCreateSession,
  adkListSessions,
  adkGetSession,
  adkDeleteSession,
  adkRunSession,
  adkPing,
};

export const AGY_DEFAULTS = {
  appName: 'relayplane-agy',
  defaultModel: 'gemini-2.5-flash',
  sessionHeader: 'x-agy-session-id',
  userHeader: 'x-agy-user-id',
} as const;

export interface AgyProviderConfig extends GoogleAdkProviderConfig {
  /** When true, prefer Antigravity Interactions API for chat (managed sandbox). */
  useManagedAgent?: boolean;
}

const AGY_INSTRUCTION = `You are AGY, an Antigravity-style coding agent.
Plan carefully, use tools when needed, and produce concise actionable answers.
Prefer reading code context, running analysis, and citing file paths when relevant.`;

function agyConfig(config?: AgyProviderConfig): GoogleAdkProviderConfig {
  const model = config?.model ?? AGY_DEFAULTS.defaultModel;
  return {
    ...config,
    appName: config?.appName ?? AGY_DEFAULTS.appName,
    model: model.startsWith('agy/') ? model.slice('agy/'.length) : model,
    agentName: config?.agentName ?? 'agy_agent',
    instruction: config?.instruction ?? AGY_INSTRUCTION,
    enableGoogleSearch: config?.enableGoogleSearch ?? true,
    enableCodeExecution: config?.enableCodeExecution ?? true,
  };
}

export async function forwardToAgyChat(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: AgyProviderConfig,
  sessionId?: string,
  userId?: string
) {
  return forwardToGoogleAdkChat(request, targetModel, apiKey, agyConfig(config), sessionId, userId);
}

export async function forwardToAgyChatStream(
  request: ChatRequestBody,
  targetModel: string,
  apiKey: string,
  config?: AgyProviderConfig,
  sessionId?: string,
  userId?: string
) {
  return forwardToGoogleAdkChatStream(request, targetModel, apiKey, agyConfig(config), sessionId, userId);
}

export function mapAgyError(err: unknown) {
  return mapGoogleAdkError(err);
}

export { GOOGLE_ADK_DEFAULTS as AGY_SESSION_DEFAULTS };
