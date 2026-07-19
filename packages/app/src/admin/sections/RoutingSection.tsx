import { useStore } from '@/admin/store/agentBuilderStore';
import { Field, Input, Select, Row, SectionCard } from '@/admin/components/ui/primitives';

export function RoutingSection() {
  const s = useStore();
  return (
    <SectionCard title="⑥ Routing & Interface" subtitle="Escalation rules and how users connect to this agent">

      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Escalation</div>
      <Row cols={3}>
        <Field label="Escalate to" hint="Agent ID to hand off unresolved tickets">
          <Input value={s.routing_escalate_to} onChange={(e) => s.set('routing_escalate_to', e.target.value)} placeholder="dev-agent" mono />
        </Field>
        <Field label="Escalate after (minutes)" hint="Auto-escalate if not resolved in this time">
          <Input type="number" value={s.routing_escalate_after_minutes} onChange={(e) => s.set('routing_escalate_after_minutes', e.target.value)} placeholder="15" min={1} />
        </Field>
        <Field label="Escalate on skill" hint="Escalate when this skill outputs ESCALATE">
          <Input value={s.routing_escalate_on_skill} onChange={(e) => s.set('routing_escalate_on_skill', e.target.value)} placeholder="l2_escalation" mono />
        </Field>
      </Row>

      <Row>
        <Field label="Accepts from" hint="Comma-separated agent IDs that can route to this agent">
          <Input value={s.routing_accepts_from} onChange={(e) => s.set('routing_accepts_from', e.target.value)} placeholder="trader-support, prod-support" mono />
        </Field>
        <Field label="Ticket system">
          <Select value={s.routing_ticket_system_type} onChange={(e) => s.set('routing_ticket_system_type', e.target.value)} options={[{ value: 'internal', label: 'Internal (platform)' }, { value: 'jira', label: 'Jira' }, { value: 'servicenow', label: 'ServiceNow' }]} />
        </Field>
      </Row>

      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Interface</div>
        <Row cols={3}>
          <Field label="Interface mode" hint="How users interact with this agent">
            <Select value={s.interface_mode} onChange={(e) => s.set('interface_mode', e.target.value as typeof s.interface_mode)} options={[{ value: 'chat', label: 'Chat only' }, { value: 'api', label: 'API only' }, { value: 'both', label: 'Chat + API' }]} />
          </Field>
          <Field label="API port" hint="Required when mode includes API">
            <Input type="number" value={s.interface_api_port} onChange={(e) => s.set('interface_api_port', e.target.value)} placeholder="8001" disabled={s.interface_mode === 'chat'} />
          </Field>
          <Field label="Session timeout (minutes)">
            <Input type="number" value={s.interface_session_timeout} onChange={(e) => s.set('interface_session_timeout', e.target.value)} placeholder="60" min={1} />
          </Field>
        </Row>
      </div>
    </SectionCard>
  );
}
