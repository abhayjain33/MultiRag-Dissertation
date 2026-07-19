export { type LLMProvider, resolveEnvVar, withRetry } from './LLMProvider.js';
export { AnthropicAdapter } from './AnthropicAdapter.js';
export { OpenAIAdapter } from './OpenAIAdapter.js';
export { AzureOpenAIAdapter } from './AzureOpenAIAdapter.js';
export { OllamaAdapter } from './OllamaAdapter.js';
export { CachingEmbedder } from './CachingEmbedder.js';

import type { LLMConfig } from '../config/schemas.js';
import type { LLMProvider } from './LLMProvider.js';
import { AnthropicAdapter } from './AnthropicAdapter.js';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import { AzureOpenAIAdapter } from './AzureOpenAIAdapter.js';
import { OllamaAdapter } from './OllamaAdapter.js';

export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'anthropic':
      return new AnthropicAdapter(config);
    case 'openai':
      return new OpenAIAdapter(config);
    case 'azure':
      return new AzureOpenAIAdapter(config);
    case 'ollama':
      return new OllamaAdapter(config);
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unknown LLM provider: ${String(exhaustive)}`);
    }
  }
}
