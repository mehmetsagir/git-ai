#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import * as setup from "./setup";
import * as commit from "./commit";
import * as reset from "./reset";
import * as stash from "./stash";
import { getErrorMessage } from "./utils/errors";

const program = new Command();

function handleError(error: unknown): void {
  console.error(chalk.red(`\n❌ Error: ${getErrorMessage(error)}\n`));
  process.exit(1);
}

program
  .name("git-ai")
  .description("AI-powered git commit tool")
  .version(require("../package.json").version);

program
  .command("setup")
  .description("Configure OpenAI API key")
  .action(async () => {
    try {
      await setup.runSetup();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("commit")
  .description("Analyze changes and create commits")
  .action(async () => {
    try {
      await commit.runCommit();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("reset")
  .description("Reset configuration")
  .action(async () => {
    try {
      await reset.resetConfig();
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("stash")
  .description("View git stashes in browser")
  .action(async () => {
    try {
      await stash.runStashViewer();
    } catch (error) {
      handleError(error);
    }
  });

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv);
