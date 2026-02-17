import type { Model } from '../types/index.js';

export type ProviderInfo = {
  name: string;
  envVar: string;
};

/** Detect all available providers from environment variables */
export function detectProviders(): ProviderInfo[] {
  const providers: ProviderInfo[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push({ name: 'anthropic', envVar: 'ANTHROPIC_API_KEY' });
  if (process.env.OPENAI_API_KEY) providers.push({ name: 'openai', envVar: 'OPENAI_API_KEY' });
  if (process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) providers.push({ name: 'google', envVar: 'GOOGLE_API_KEY' });
  return providers;
}

/** Resolve a model from provider name + optional model ID */
export async function resolveModel(provider: string, modelName?: string): Promise<Model> {
  switch (provider) {
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic');
      return anthropic(modelName ?? 'claude-sonnet-4-5') as unknown as Model;
    }
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai');
      return openai(modelName ?? 'gpt-4o-mini') as unknown as Model;
    }
    case 'google': {
      const { google } = await import('@ai-sdk/google');
      return google(modelName ?? 'gemini-2.0-flash') as unknown as Model;
    }
    default:
      throw new Error(`Unknown provider: ${provider}. Use: anthropic, openai, google`);
  }
}

/** Get the default model name for a provider */
export function defaultModelName(provider: string): string {
  switch (provider) {
    case 'anthropic': return 'claude-sonnet-4-5';
    case 'openai': return 'gpt-4o-mini';
    case 'google': return 'gemini-2.0-flash';
    default: return 'unknown';
  }
}
