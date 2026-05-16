import chalk from 'chalk';
import { ConfigValidator, formatValidationResult } from '@agent-platform/core';

export async function runValidate(configPath: string): Promise<void> {
  console.log(chalk.cyan(`\nValidating ${configPath}…\n`));
  const validator = new ConfigValidator();
  const result = validator.validateAgentConfig(configPath);
  console.log(formatValidationResult(result, configPath));
  if (!result.valid) process.exit(1);
}
