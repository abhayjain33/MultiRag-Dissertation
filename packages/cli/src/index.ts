#!/usr/bin/env node
import { Command } from 'commander';
import { runValidate } from './commands/validate.js';
import { runStart } from './commands/start.js';
import { runChat } from './commands/chat.js';
import { runInit } from './commands/init.js';

const program = new Command();

program
  .name('agent-platform')
  .description('Config-file-driven AI Agent Platform')
  .version('1.0.0');

program
  .command('validate <config>')
  .description('Validate an agent.yaml configuration file')
  .action((config: string) => void runValidate(config));

program
  .command('start <config>')
  .description('Start an agent from a config file (HTTP + WebSocket API)')
  .action((config: string) => void runStart(config));

program
  .command('chat <config>')
  .description('Start an agent and open an interactive chat session')
  .action((config: string) => void runChat(config));

program
  .command('init <name>')
  .description('Scaffold a new agent project directory')
  .action((name: string) => void runInit(name));

program.parse();
