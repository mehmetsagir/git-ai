#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import * as setup from "./setup";
import * as commit from "./commit";
import * as users from "./users";
import * as reset from "./reset";
import * as add from "./add";
import * as update from "./update";
import * as summary from "./summary";
import * as setEditor from "./set-editor";
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
    .option("--update", "Check for updates and update to latest version")
    .configureHelp({
      helpWidth: 100,
      sortSubcommands: true,
      subcommandTerm: (cmd) => {
        const aliases =
          cmd.aliases().length > 0 ? ` (${cmd.aliases().join(", ")})` : "";
        return chalk.cyan(cmd.name()) + chalk.gray(aliases);
      },
      commandUsage: (cmd) => {
        const name =
          cmd.name() === "git-ai" ? "git-ai" : `git-ai ${cmd.name()}`;
        return chalk.bold.cyan(name);
      },
      formatHelp: (cmd, helper) => {
        const indent = "  ";

        let output = "\n";

        // 3D ASCII Art Title - git-ai
        const title3D = `
  ${chalk.bold.white(" ██████╗ ██╗████████╗")}    ${chalk.bold.white(
          " █████╗ ██╗"
        )}
  ${chalk.bold.white("██╔════╝ ██║╚══██╔══╝")}    ${chalk.bold.white(
          "██╔══██╗██║"
        )}
  ${chalk.bold.white("██║  ███╗██║   ██║")}       ${chalk.bold.white(
          "███████║██║"
        )}
  ${chalk.bold.white("██║   ██║██║   ██║")}       ${chalk.bold.white(
          "██╔══██║██║"
        )}
  ${chalk.bold.white("╚██████╔╝██║   ██║")}       ${chalk.bold.white(
          "██║  ██║██║"
        )}
  ${chalk.bold.white(" ╚═════╝ ╚═╝   ╚═╝")}       ${chalk.bold.white(
          "╚═╝  ╚═╝╚═╝"
        )}

  ${chalk.gray("AI-Powered Git Commit Tool")}
`;

        output += title3D + "\n";

        // Usage
        const usage = helper.commandUsage(cmd);
        output += chalk.bold("Usage:\n");
        output += indent + usage + "\n\n";

        // Options
        const visibleOptions = helper.visibleOptions(cmd);
        if (visibleOptions.length > 0) {
          output += chalk.bold("Options:\n");
          visibleOptions.forEach((option) => {
            const flags = option.flags;
            const description = option.description;
            const flagsLength = flags.replace(/\x1b\[[0-9;]*m/g, "").length;
            const padding = " ".repeat(Math.max(1, 30 - flagsLength));
            output +=
              indent +
              chalk.cyan(flags) +
              padding +
              chalk.gray(description) +
              "\n";
          });
          output += "\n";
        }

        // Commands - Grouped
        const visibleCommands = helper.visibleCommands(cmd);
        if (visibleCommands.length > 0) {
          // Categorize commands
          const setupCommands = ["setup", "reset", "set-editor"];
          const gitCommands = ["commit", "summary"];
          const userCommands = ["add", "list", "remove"];

          const categorizeCommand = (cmdName: string) => {
            if (setupCommands.includes(cmdName)) return "setup";
            if (gitCommands.includes(cmdName)) return "git";
            if (userCommands.includes(cmdName)) return "user";
            return "other";
          };

          const categorized = {
            setup: [] as typeof visibleCommands,
            git: [] as typeof visibleCommands,
            user: [] as typeof visibleCommands,
            other: [] as typeof visibleCommands,
          };

          visibleCommands.forEach((subcmd) => {
            const category = categorizeCommand(subcmd.name());
            categorized[category].push(subcmd);
          });

          // Setup & Configuration
          if (categorized.setup.length > 0) {
            output += chalk.bold.white("Setup & Configuration:\n");
            categorized.setup.forEach((subcmd) => {
              const aliases =
                subcmd.aliases().length > 0
                  ? ` (${subcmd.aliases().join(", ")})`
                  : "";
              const name = chalk.cyan(subcmd.name()) + chalk.gray(aliases);
              const description = subcmd.description();
              const nameLength = subcmd.name().length + aliases.length;
              const padding = " ".repeat(Math.max(1, 30 - nameLength));
              output +=
                indent + name + padding + chalk.gray(description) + "\n";
            });
            output += "\n";
          }

          // Git Operations
          if (categorized.git.length > 0) {
            output += chalk.bold.white("Git Operations:\n");
            categorized.git.forEach((subcmd) => {
              const aliases =
                subcmd.aliases().length > 0
                  ? ` (${subcmd.aliases().join(", ")})`
                  : "";
              const name = chalk.cyan(subcmd.name()) + chalk.gray(aliases);
              const description = subcmd.description();
              const nameLength = subcmd.name().length + aliases.length;
              const padding = " ".repeat(Math.max(1, 30 - nameLength));
              output +=
                indent + name + padding + chalk.gray(description) + "\n";
            });
            output += "\n";
          }

          // User Management
          if (categorized.user.length > 0) {
            output += chalk.bold.white("User Management:\n");
            categorized.user.forEach((subcmd) => {
              const aliases =
                subcmd.aliases().length > 0
                  ? ` (${subcmd.aliases().join(", ")})`
                  : "";
              const name = chalk.cyan(subcmd.name()) + chalk.gray(aliases);
              const description = subcmd.description();
              const nameLength = subcmd.name().length + aliases.length;
              const padding = " ".repeat(Math.max(1, 30 - nameLength));
              output +=
                indent + name + padding + chalk.gray(description) + "\n";
            });
            output += "\n";
          }

          // Other commands
          if (categorized.other.length > 0) {
            categorized.other.forEach((subcmd) => {
              const aliases =
                subcmd.aliases().length > 0
                  ? ` (${subcmd.aliases().join(", ")})`
                  : "";
              const name = chalk.cyan(subcmd.name()) + chalk.gray(aliases);
              const description = subcmd.description();
              const nameLength = subcmd.name().length + aliases.length;
              const padding = " ".repeat(Math.max(1, 30 - nameLength));
              output +=
                indent + name + padding + chalk.gray(description) + "\n";
            });
            output += "\n";
          }
        }

        // Footer
        output += chalk.gray(
          "Run 'git-ai <command> --help' for more information on a command.\n"
        );

        return output;
      },
    });

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
    .description(
      "Reset all configuration (deletes OpenAI key and all git users)"
    )
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
        handleError(error, true);
      }
    });

  if (process.argv.length === 2) {
    program.help();
  }

  program.parse(process.argv);
}
