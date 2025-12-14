#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import * as setup from "./setup";
import * as commit from "./commit";
import * as users from "./users";
import * as reset from "./reset";
import * as add from "./add";
import * as update from "./update";
import packageJson from "../package.json";
import { getErrorMessage } from "./utils/errors";

const program = new Command();

/**
 * Handle command errors consistently
 */
function handleError(error: unknown, showStack = false): void {
  const err =
    error instanceof Error ? error : new Error(getErrorMessage(error));
  console.error(chalk.red(`\n❌ Error: ${err.message}\n`));
  if (showStack && err.stack) {
    console.error(chalk.gray(err.stack));
  }
  process.exit(1);
}

// Check for --update flag before parsing
if (process.argv.includes("--update")) {
  (async () => {
    try {
      await update.checkAndUpdate();
      process.exit(0);
    } catch (error) {
      handleError(error);
    }
  })();
  // Don't continue - the async function will exit the process when done
} else {
  // Check for updates silently in background (after a delay to not block startup)
  setTimeout(() => {
    update.checkForUpdates();
  }, 1000);

  program
    .name("git-ai")
    .description(
      "AI-powered git commit tool that analyzes diffs and creates conventional commit messages"
    )
    .version(packageJson.version)
    .option("--update", "Check for updates and update to latest version");

  program
    .command("setup")
    .description("Initial setup - OpenAI API key and git user configuration")
    .action(async () => {
      try {
        await setup.runSetup();
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("commit")
    .description("Analyze git diffs and create commits")
    .option(
      "-u, --user <user>",
      "Git user ID or email to use (instead of default user)"
    )
    .action(async (options: { user?: string }) => {
      try {
        await commit.runCommit(options.user);
      } catch (error) {
        handleError(error, true);
      }
    });

  program
    .command("add")
    .alias("add-user")
    .description("Add a new git user profile")
    .action(async () => {
      try {
        await add.addUser();
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("list")
    .alias("users")
    .description("List all configured git user profiles")
    .action(() => {
      try {
        users.listUsers();
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("remove")
    .alias("delete")
    .description("Remove a git user profile")
    .action(async () => {
      try {
        await users.removeUser();
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("reset")
    .description("Reset all configuration (deletes OpenAI key and all git users)")
    .action(async () => {
      try {
        await reset.resetConfig();
      } catch (error) {
        handleError(error);
      }
    });

  if (process.argv.length === 2) {
    program.help();
  }

  program.parse(process.argv);
}
