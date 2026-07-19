import { Plus, Trash2, ChevronDown, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '@/admin/store/agentBuilderStore';
import { Field, Input, Select, Row, SectionCard, Button } from '@/admin/components/ui/primitives';

export function MCPSection() {
  const { mcps, addMCP, removeMCP, patchMCP } = useStore();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <SectionCard
      title="⑤ MCP Tools"
      subtitle="External tools via Model Context Protocol servers"
      badge={<Button variant="primary" size="xs" onClick={addMCP}><Plus size={12} /> Add MCP</Button>}
    >
      {mcps.length === 0 && (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg text-sm">
          No MCP connections. Connect to Confluence, GitLab, PagerDuty and other tools.<br />
          <button onClick={addMCP} className="mt-1 text-indigo-500 hover:underline">+ Add first MCP server</button>
        </div>
      )}

      {mcps.map((mcp, i) => {
        const isOpen = open === i;
        return (
          <div key={mcp._key} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setOpen(isOpen ? null : i)}
            >
              {mcp.enabled ? <Wifi size={14} className="text-green-500" /> : <WifiOff size={14} className="text-gray-300" />}
              <span className="text-sm font-medium text-gray-800 flex-1">{mcp.name || <span className="italic text-gray-400">Unnamed MCP</span>}</span>
              {mcp.url && <span className="text-[11px] text-gray-400 font-mono truncate max-w-32">{mcp.url}</span>}
              <label onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={mcp.enabled} onChange={(e) => patchMCP(i, { enabled: e.target.checked })} className="accent-indigo-600" />
                enabled
              </label>
              <button onClick={(e) => { e.stopPropagation(); removeMCP(i); }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
              {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="px-4 py-4 space-y-4 bg-white">
                <Row>
                  <Field label="MCP ID" required hint="Unique identifier for this MCP connection">
                    <Input value={mcp.id} onChange={(e) => patchMCP(i, { id: e.target.value })} placeholder="confluence" mono />
                  </Field>
                  <Field label="Display Name" required>
                    <Input value={mcp.name} onChange={(e) => patchMCP(i, { name: e.target.value })} placeholder="Confluence" />
                  </Field>
                </Row>
                <Field label="Server URL" required hint="MCP server endpoint (SSE transport)">
                  <Input value={mcp.url} onChange={(e) => patchMCP(i, { url: e.target.value })} placeholder="${CONFLUENCE_MCP_URL}" mono />
                </Field>
                <Row>
                  <Field label="Auth type">
                    <Select value={mcp.auth_type} onChange={(e) => patchMCP(i, { auth_type: e.target.value as typeof mcp.auth_type })} options={[{ value: 'bearer', label: 'Bearer token' }, { value: 'basic', label: 'Basic auth' }, { value: 'none', label: 'None' }]} />
                  </Field>
                  <Field label="Auth token / credentials" hint="Use an env var reference">
                    <Input value={mcp.auth_token} onChange={(e) => patchMCP(i, { auth_token: e.target.value })} placeholder="${CONFLUENCE_TOKEN}" mono disabled={mcp.auth_type === 'none'} />
                  </Field>
                </Row>
                <Field label="Tool whitelist" hint="Comma-separated tool names to allow. Leave empty to allow all tools.">
                  <Input value={mcp.tools} onChange={(e) => patchMCP(i, { tools: e.target.value })} placeholder="search_pages, get_page_content" mono />
                </Field>
              </div>
            )}
          </div>
        );
      })}
    </SectionCard>
  );
}
