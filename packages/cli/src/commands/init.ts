import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';

const AGENT_YAML = `agent:
  name: my-agent
  display_name: My Agent
  description: A new AI agent
  version: 1.0.0
  icon: 🤖

llm:
  provider: anthropic
  model: claude-sonnet-4-6
  api_key: \${ANTHROPIC_API_KEY}
  temperature: 0.2
  max_tokens: 4096

knowledge:
  embedding_model: text-embedding-3-small
  vector_store: local
  vector_store_path: ./data/vectors/
  sources:
    - id: docs
      type: markdown
      path: ./kb/
      glob: '**/*.md'
      refresh: on_change

skills:
  - id: l1_analysis
    name: L1 Incident Analysis
    trigger: on_ticket
    prompt_template: ./prompts/l1_analysis.md
    inputs:
      - name: title
        type: string
        required: true
      - name: description
        type: string
        required: true
    output:
      format: plain

interface:
  mode: both
  api_port: 8001
  session_timeout_minutes: 60
`;

const PROMPT_TEMPLATE = `You are an AI support agent analysing an incident ticket.

Ticket title: {{title}}
Description: {{description}}

Please provide:
1. A brief summary of the issue
2. The most likely root cause
3. Recommended next steps
4. Whether this should be RESOLVED or ESCALATED

Be concise and structured.
`;

const ENV_EXAMPLE = `ANTHROPIC_API_KEY=your-key-here
`;

export async function runInit(name: string): Promise<void> {
  const dir = join(process.cwd(), name);
  console.log(chalk.cyan(`\nInitialising agent "${name}" in ${dir}…\n`));

  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, 'kb'), { recursive: true });
  await mkdir(join(dir, 'prompts'), { recursive: true });
  await mkdir(join(dir, 'data', 'vectors'), { recursive: true });

  await writeFile(join(dir, 'agent.yaml'), AGENT_YAML);
  await writeFile(join(dir, 'prompts', 'l1_analysis.md'), PROMPT_TEMPLATE);
  await writeFile(join(dir, '.env.example'), ENV_EXAMPLE);
  await writeFile(join(dir, 'kb', 'README.md'), `# Knowledge Base\n\nAdd your Markdown documents here.\n`);

  console.log(chalk.green('✓ Created:'));
  console.log('  agent.yaml           — agent configuration');
  console.log('  prompts/l1_analysis.md — skill prompt template');
  console.log('  kb/                  — knowledge base directory');
  console.log('  .env.example         — environment variables');
  console.log('\nNext steps:');
  console.log(chalk.bold(`  cd ${name}`));
  console.log(chalk.bold('  cp .env.example .env && nano .env   # set your API key'));
  console.log(chalk.bold('  agent-platform validate agent.yaml'));
  console.log(chalk.bold('  agent-platform start agent.yaml\n'));
}
