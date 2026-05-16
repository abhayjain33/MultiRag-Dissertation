import OpenAI from 'openai';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import { resolveEnvVar } from './LLMProvider.js';
import type { LLMConfig } from '../config/schemas.js';

export class AzureOpenAIAdapter extends OpenAIAdapter {
  constructor(config: LLMConfig) {
    if (config.provider !== 'azure') {
      throw new Error('AzureOpenAIAdapter requires provider: azure');
    }
    if (!config.azure_endpoint) throw new Error('azure_endpoint is required for Azure provider');
    if (!config.azure_deployment) throw new Error('azure_deployment is required for Azure provider');

    const azureClient = new OpenAI({
      apiKey: config.api_key ? resolveEnvVar(config.api_key) : undefined,
      baseURL: `${resolveEnvVar(config.azure_endpoint)}/openai/deployments/${config.azure_deployment}`,
      defaultQuery: { 'api-version': config.azure_api_version ?? '2024-02-01' },
      defaultHeaders: { 'api-key': config.api_key ? resolveEnvVar(config.api_key) : '' },
    });

    super(config, azureClient);
  }

  override async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }
}
