import { useStore } from '@/store/agentBuilderStore';
import { Field, Input, Textarea, Row, SectionCard } from '@/components/ui/primitives';

const ICON_SUGGESTIONS = ['🤖', '🛡️', '💼', '⚙️', '🔍', '📊', '🧠', '🚀', '💡', '🔧'];

export function AgentInfoSection() {
  const { name, display_name, description, version, icon, set } = useStore();
  return (
    <SectionCard title="① Agent Info" subtitle="Identity and description of this agent">
      <Row>
        <Field label="Agent ID" required hint='Lowercase, hyphens only — used in routing (e.g. "prod-support")'>
          <Input
            value={name}
            onChange={(e) => set('name', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="prod-support"
            mono
          />
        </Field>
        <Field label="Display Name" required hint="Shown in the UI and ticket tracker">
          <Input value={display_name} onChange={(e) => set('display_name', e.target.value)} placeholder="Production Support Agent" />
        </Field>
      </Row>

      <Field label="Description" hint="One sentence describing what this agent does">
        <Textarea value={description} onChange={(e) => set('description', e.target.value)} rows={2} placeholder="L1/L2 incident triage using logs, runbooks and knowledge graph" />
      </Field>

      <Row>
        <Field label="Version">
          <Input value={version} onChange={(e) => set('version', e.target.value)} placeholder="1.0.0" />
        </Field>
        <Field label="Icon" hint="Emoji shown in the dashboard">
          <div className="flex gap-2 items-center">
            <Input value={icon} onChange={(e) => set('icon', e.target.value)} className="w-16 text-center text-lg" />
            <div className="flex gap-1 flex-wrap">
              {ICON_SUGGESTIONS.map((em) => (
                <button key={em} onClick={() => set('icon', em)} className="text-lg hover:scale-125 transition-transform" title={em}>{em}</button>
              ))}
            </div>
          </div>
        </Field>
      </Row>
    </SectionCard>
  );
}
