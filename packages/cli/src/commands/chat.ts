import chalk from 'chalk';
import * as readline from 'node:readline';
import { AgentManager } from '@agent-platform/core';

export async function runChat(configPath: string): Promise<void> {
  const manager = new AgentManager();
  console.log(chalk.cyan(`\nStarting agent from ${configPath}…\n`));
  try {
    await manager.start(configPath);
  } catch (e) {
    console.error(chalk.red(`Failed to start: ${String(e)}`));
    process.exit(1);
  }

  console.log(chalk.green('✓ Agent ready. Type a message to create a ticket or /quit to exit.\n'));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  // Print WS events as they come
  manager.on('ws', (event: Record<string, unknown>) => {
    const type = String(event['type'] ?? '');
    const payload = event['payload'] as Record<string, unknown> | undefined;
    if (type === 'agent.thinking') {
      process.stdout.write(chalk.yellow(`  [thinking] Running ${String(payload?.['skill_id'] ?? '')}…\n`));
    } else if (type === 'agent.kb_lookup_complete') {
      const n = (payload?.['results'] as unknown[] | undefined)?.length ?? 0;
      process.stdout.write(chalk.blue(`  [KB] Found ${n} relevant chunks\n`));
    } else if (type === 'agent.skill_complete') {
      const ok = payload?.['success'] === true;
      const icon = ok ? chalk.green('✓') : chalk.red('✗');
      process.stdout.write(`  ${icon} Skill "${String(payload?.['skill_id'] ?? '')}" done in ${String(payload?.['execution_time_ms'] ?? '?')}ms\n`);
    } else if (type === 'ticket.escalated') {
      process.stdout.write(chalk.magenta(`  [escalated] → ${String(payload?.['target_agent'] ?? 'queue')}: ${String(payload?.['reason'] ?? '')}\n`));
    } else if (type === 'ticket.resolved') {
      process.stdout.write(chalk.green('  [resolved] Ticket resolved ✓\n'));
    }
  });

  const prompt = () => rl.question(chalk.bold('\nYou: '), async (input) => {
    const text = input.trim();
    if (!text || text === '/quit') {
      console.log(chalk.yellow('\nStopping…'));
      await manager.stop();
      rl.close();
      process.exit(0);
    }
    if (text.startsWith('/')) {
      console.log(chalk.gray('Commands: /quit'));
    } else {
      process.stdout.write('\n');
      await manager.createTicket({ title: text, raised_by: 'cli-user' });
    }
    prompt();
  });

  prompt();
}
