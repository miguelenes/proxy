/**
 * Provider endpoint registry and resolution.
 *
 * @packageDocumentation
 */

export interface ProviderEndpoint {
  baseUrl: string;
  apiKeyEnv: string;
  /** Bearer (default) or api-key (Azure Foundry) */
  authStyle?: 'bearer' | 'api-key';
}

/** Providers with OpenAI-compatible /v1/chat/completions APIs (excludes deepseek, zai, ollama-cloud, nvidia, openrouter — dedicated modules) */
export const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  'groq',
  'mistral',
  'together',
  'fireworks',
  'perplexity',
]);

export const DEFAULT_ENDPOINTS: Record<string, ProviderEndpoint> = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    apiKeyEnv: 'MISTRAL_API_KEY',
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    apiKeyEnv: 'TOGETHER_API_KEY',
  },
  fireworks: {
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    apiKeyEnv: 'FIREWORKS_API_KEY',
  },
  perplexity: {
    baseUrl: 'https://api.perplexity.ai',
    apiKeyEnv: 'PERPLEXITY_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    apiKeyEnv: 'OLLAMA_API_KEY',
  },
  nvidia: {
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKeyEnv: 'NVIDIA_API_KEY',
  },
  zai: {
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiKeyEnv: 'ZAI_API_KEY',
  },
  'ollama-cloud': {
    baseUrl: 'https://ollama.com/v1',
    apiKeyEnv: 'OLLAMA_API_KEY',
  },
  'azure-foundry': {
    baseUrl: '',
    apiKeyEnv: 'AZURE_OPENAI_API_KEY',
    authStyle: 'api-key',
  },
  copilot: {
    baseUrl: 'https://api.githubcopilot.com',
    apiKeyEnv: 'COPILOT_GITHUB_TOKEN',
  },
  kimi: {
    baseUrl: 'https://api.moonshot.ai/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
  },
  'kimi-agent': {
    baseUrl: '',
    apiKeyEnv: '',
  },
  qwen: {
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
  },
  'qwen-agent': {
    baseUrl: '',
    apiKeyEnv: '',
  },
  devin: {
    baseUrl: 'https://api.devin.ai/v3',
    apiKeyEnv: 'DEVIN_API_KEY',
  },
  'opencode-zen': {
    baseUrl: 'https://opencode.ai/zen/v1',
    apiKeyEnv: 'OPENCODE_ZEN_API_KEY',
  },
  'opencode-go': {
    baseUrl: 'https://opencode.ai/zen/go/v1',
    apiKeyEnv: 'OPENCODE_GO_API_KEY',
  },
  opencode: {
    baseUrl: 'http://127.0.0.1:4096',
    apiKeyEnv: '',
  },
  'google-adk': {
    baseUrl: '',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
  antigravity: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
  agy: {
    baseUrl: '',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
};

/** All provider IDs valid in provider/model slash notation */
export const VALID_SLASH_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'xai',
  'openrouter',
  'deepseek',
  'groq',
  'mistral',
  'together',
  'fireworks',
  'perplexity',
  'nvidia',
  'zai',
  'ollama-cloud',
  'azure-foundry',
  'copilot',
  'kimi',
  'kimi-agent',
  'qwen',
  'qwen-agent',
  'devin',
  'opencode-zen',
  'opencode-go',
  'google-adk',
  'antigravity',
  'agy',
  'local',
  'ollama',
] as const;

export type SlashProvider = (typeof VALID_SLASH_PROVIDERS)[number];

export interface ProviderConfigOverride {
  baseUrl?: string;
  apiKeyEnv?: string;
  enabled?: boolean;
  orgId?: string;
}

export type ProvidersConfigMap = Record<string, ProviderConfigOverride>;

/**
 * Merge DEFAULT_ENDPOINTS with optional ~/.trestle/config.json providers section.
 */
export function getProviderEndpoint(
  provider: string,
  providersConfig?: ProvidersConfigMap
): ProviderEndpoint {
  const defaults = DEFAULT_ENDPOINTS[provider] ?? {
    baseUrl: '',
    apiKeyEnv: `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`,
    authStyle: 'bearer' as const,
  };
  const override = providersConfig?.[provider];
  const baseUrl = override?.baseUrl?.trim() || defaults.baseUrl;
  const apiKeyEnv = override?.apiKeyEnv || defaults.apiKeyEnv;
  return {
    baseUrl,
    apiKeyEnv,
    authStyle: defaults.authStyle,
  };
}

export function isOpenAiCompatibleProvider(provider: string): boolean {
  return OPENAI_COMPATIBLE_PROVIDERS.has(provider);
}
