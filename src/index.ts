#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import * as setup from "./setup";
import * as commit from "./commit";
import * as reset from "./reset";
import * as stash from "./stash";
import * as ui from "./ui";
import * as add from "./add";
import * as users from "./users";
import * as setEditor from "./set-editor";
import * as summary from "./summary";
import * as update from "./update";
import { getErrorMessage } from "./utils/errors";

const program = new Command();

function handleError(error: unknown): void {
  console.error(chalk.red(`\n❌ Error: ${getErrorMessage(error)}\n`));
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
} else {
  // Check for updates silently in background
  setTimeout(() => {
    update.checkForUpdates();
  }, 1000);

  program
    .name("git-ai")
    .description("AI-powered git commit tool")
    .version(require("../package.json").version)
    .option("--update", "Check for updates and update to latest version");

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
    .option("-u, --user <user>", "Git user ID, email, or shortcut to use as author")
    .action(async (options: { user?: string }) => {
      try {
        await commit.runCommit(options.user);
      } catch (error) {
        handleError(error);
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
    .description("Reset configuration")
    .action(async () => {
      try {
        await reset.resetConfig();
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("set-editor")
    .alias("editor")
    .description("Change your preferred editor for commit messages")
    .action(async () => {
      try {
        await setEditor.setEditorPreference();
      } catch (error) {
        handleError(error);
      }
    });

  program
    .command("summary")
    .alias("sum")
    .description("Generate a summary of current changes using AI")
    .option(
      "-o, --output <file>",
      "Output file path (default: CHANGES_SUMMARY.md)"
    )
    .action(async (options: { output?: string }) => {
      try {
        await summary.runSummary(options.output);
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

  program
    .command("ui")
    .description("Open web UI for managing commits")
    .action(async () => {
      try {
        await ui.runUI();
      } catch (error) {
        handleError(error);
      }
    });

  // Show help if no command provided
  if (process.argv.length === 2) {
    program.help();
  }

  program.parse(process.argv);
}
