import { resolveEnvVar } from '../llm/LLMProvider.js';
import type { Tool, ToolResult } from '../types.js';
import type { MCPConfig } from '../config/schemas.js';

interface MCPToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class MCPClient {
  private tools: Tool[] = [];
  private baseUrl = '';
  private authHeader: string | undefined;
  connected = false;

  constructor(private config: MCPConfig) {}

  get id(): string { return this.config.id; }

  async connect(): Promise<void> {
    this.baseUrl = resolveEnvVar(this.config.url);
    const token = this.config.auth_token ? resolveEnvVar(this.config.auth_token) : undefined;
    if (this.config.auth_type === 'bearer' && token) this.authHeader = `Bearer ${token}`;
    if (this.config.auth_type === 'basic' && token) this.authHeader = `Basic ${Buffer.from(token).toString('base64')}`;

    const headers = this.buildHeaders();
    headers['Content-Type'] = 'application/json';
    let defs: MCPToolDef[] = [];
    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      });
      if (res.ok) {
        const data = await res.json() as { result?: { tools?: MCPToolDef[] } };
        defs = data.result?.tools ?? [];
      } else {
        console.warn(`[MCP:${this.config.id}] /messages tools/list returned ${res.status}`);
      }
    } catch (e) {
      console.warn(`[MCP:${this.config.id}] Connection failed: ${String(e)}`);
      return;
    }

    const whitelist = this.config.tools ?? [];
    this.tools = defs
      .filter(t => whitelist.length === 0 || whitelist.includes(t.name))
      .map(t => ({
        name: `${this.config.id}__${t.name}`,
        description: `[${this.config.name}] ${t.description}`,
        input_schema: t.inputSchema,
      }));

    this.connected = true;
    console.log(`[MCP:${this.config.id}] Connected — ${this.tools.length} tools`);
  }

  getTools(): Tool[] { return this.connected ? this.tools : []; }

  async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const prefix = `${this.config.id}__`;
    const rawName = qualifiedName.startsWith(prefix) ? qualifiedName.slice(prefix.length) : qualifiedName;
    const headers = this.buildHeaders();
    headers['Content-Type'] = 'application/json';
    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: rawName, arguments: args } }),
      });
      const data = await res.json() as { result?: { content?: Array<{ type: string; text: string }> }; error?: { message: string } };
      if (!res.ok || data.error) return { tool_call_id: qualifiedName, content: data.error?.message ?? 'Tool error', is_error: true };
      const text = data.result?.content?.[0]?.text ?? JSON.stringify(data.result);
      return { tool_call_id: qualifiedName, content: text };
    } catch (e) {
      return { tool_call_id: qualifiedName, content: String(e), is_error: true };
    }
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.authHeader) h['Authorization'] = this.authHeader;
    return h;
  }
}
