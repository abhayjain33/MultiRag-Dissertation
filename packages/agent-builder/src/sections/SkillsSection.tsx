import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '@/store/agentBuilderStore';
import { Field, Input, Textarea, Select, Row, SectionCard, Button } from '@/components/ui/primitives';

const TRIGGER_INFO: Record<string, string> = {
  explicit: 'Called manually via the API or CLI',
  on_ticket: 'Auto-runs when a ticket is assigned to this agent',
  on_escalation: 'Auto-runs when a ticket is escalated to this agent',
  on_message: 'Runs on every incoming chat message',
};

export function SkillsSection() {
  const { skills, addSkill, removeSkill, patchSkill, addSkillInput, removeSkillInput, patchSkillInput } = useStore();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <SectionCard
      title="④ Skills"
      subtitle="Prompt templates this agent can execute"
      badge={<Button variant="primary" size="xs" onClick={addSkill}><Plus size={12} /> Add skill</Button>}
    >
      {skills.length === 0 && (
        <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg text-sm">
          No skills yet. Skills are prompt templates with input/output schemas.<br />
          <button onClick={addSkill} className="mt-1 text-indigo-500 hover:underline">+ Add your first skill</button>
        </div>
      )}

      {skills.map((sk, i) => {
        const isOpen = open === i;
        return (
          <div key={sk._key} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span className="text-sm font-medium text-gray-800 flex-1">{sk.name || <span className="italic text-gray-400">Unnamed skill</span>}</span>
              <span className="text-[11px] bg-indigo-100 text-indigo-600 rounded-full px-2 py-0.5">{sk.trigger}</span>
              <span className="text-[11px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{sk.output_format}</span>
              <button onClick={(e) => { e.stopPropagation(); removeSkill(i); }} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>
              {isOpen ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="px-4 py-4 space-y-4 bg-white">
                <Row>
                  <Field label="Skill ID" required hint="Unique ID, used in routing.escalate_on_skill">
                    <Input value={sk.id} onChange={(e) => patchSkill(i, { id: e.target.value })} placeholder="l1_analysis" mono />
                  </Field>
                  <Field label="Name" required>
                    <Input value={sk.name} onChange={(e) => patchSkill(i, { name: e.target.value })} placeholder="L1 Incident Analysis" />
                  </Field>
                </Row>
                <Field label="Description">
                  <Input value={sk.description} onChange={(e) => patchSkill(i, { description: e.target.value })} placeholder="Generate a structured L1 triage report from ticket context and logs" />
                </Field>
                <Row cols={3}>
                  <Field label="Trigger" hint={TRIGGER_INFO[sk.trigger]}>
                    <Select value={sk.trigger} onChange={(e) => patchSkill(i, { trigger: e.target.value as typeof sk.trigger })} options={[{ value: 'explicit', label: 'Explicit (manual)' }, { value: 'on_ticket', label: 'On ticket assigned' }, { value: 'on_escalation', label: 'On escalation' }, { value: 'on_message', label: 'On message' }]} />
                  </Field>
                  <Field label="Output format">
                    <Select value={sk.output_format} onChange={(e) => patchSkill(i, { output_format: e.target.value as typeof sk.output_format })} options={[{ value: 'plain', label: 'Plain text' }, { value: 'markdown', label: 'Markdown' }, { value: 'structured', label: 'Structured JSON' }]} />
                  </Field>
                  <Field label="Output schema" hint="JSON Schema file path (only for structured)">
                    <Input value={sk.output_schema} onChange={(e) => patchSkill(i, { output_schema: e.target.value })} placeholder="./schemas/l1_report.json" mono disabled={sk.output_format !== 'structured'} />
                  </Field>
                </Row>
                <Field label="Prompt template" required hint="Path to the .md prompt template file">
                  <Input value={sk.prompt_template} onChange={(e) => patchSkill(i, { prompt_template: e.target.value })} placeholder="./prompts/l1_analysis.md" mono />
                </Field>

                {/* Inputs */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-700">Inputs <span className="text-gray-400 font-normal">— {'{{variable}}'} placeholders in the prompt</span></label>
                    <Button size="xs" variant="ghost" onClick={() => addSkillInput(i)}><Plus size={11} /> Add input</Button>
                  </div>
                  {sk.inputs.length === 0 && <p className="text-xs text-gray-400 italic">No inputs defined</p>}
                  {sk.inputs.map((inp, j) => (
                    <div key={j} className="flex items-center gap-2 mb-2">
                      <Input value={inp.name} onChange={(e) => patchSkillInput(i, j, { name: e.target.value })} placeholder="variable_name" mono className="flex-1" />
                      <Select value={inp.type} onChange={(e) => patchSkillInput(i, j, { type: e.target.value })} className="w-28" options={[{ value: 'string', label: 'string' }, { value: 'number', label: 'number' }, { value: 'boolean', label: 'boolean' }, { value: 'object', label: 'object' }, { value: 'array', label: 'array' }]} />
                      <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer whitespace-nowrap">
                        <input type="checkbox" checked={inp.required} onChange={(e) => patchSkillInput(i, j, { required: e.target.checked })} className="accent-indigo-600" />
                        required
                      </label>
                      <button onClick={() => removeSkillInput(i, j)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </SectionCard>
  );
}
