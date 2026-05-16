import chalk from 'chalk';
import { AgentManager } from '@agent-platform/core';

export async function runStart(configPath: string): Promise<void> {
  const manager = new AgentManager();

  // Graceful shutdown
  const shutdown = async () => {
    console.log(chalk.yellow('\n\nStopping agent…'));
    await manager.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  console.log(chalk.cyan(`\nStarting agent from ${configPath}…\n`));
  try {
    await manager.start(configPath);
    console.log(chalk.green('✓ Agent is running. Press Ctrl+C to stop.\n'));
  } catch (e) {
    console.error(chalk.red(`\nFailed to start agent:\n${String(e)}`));
    process.exit(1);
  }
}
