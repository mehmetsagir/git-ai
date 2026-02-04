import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import * as fs from "fs";
import * as path from "path";
import * as config from "./config";
import * as git from "./git";
import * as openai from "./openai";
import { getErrorMessage } from "./utils/errors";

/**
 * Run summary command
 */
export async function runSummary(outputFile?: string): Promise<void> {
  console.log(chalk.blue.bold("\n📊 Changes Summary\n"));

  if (!config.configExists()) {
    console.log(
      chalk.yellow("⚠ Configuration not found. Please run setup first.\n")
    );
    console.log(chalk.blue("Run: git-ai setup\n"));
    return;
  }

  const openaiKey = config.getOpenAIKey();
  if (!openaiKey) {
    console.log(
      chalk.yellow("⚠ OpenAI API key not found. Please run setup first.\n")
    );
    console.log(chalk.blue("Run: git-ai setup\n"));
    return;
  }

  const isRepo = await git.isGitRepository();
  if (!isRepo) {
    console.log(chalk.red("❌ This directory is not a git repository!\n"));
    return;
  }

  const hasChanges = await git.hasChanges();
  if (!hasChanges) {
    console.log(chalk.yellow("⚠ No changes found.\n"));
    return;
  }

  // Check git status and inform user
  const stagedFiles = await git.getStagedFiles();
  const allChangedFiles = await git.getAllChangedFiles();
  const unstagedFiles = allChangedFiles.filter(
    (file) => !stagedFiles.includes(file)
  );

  if (stagedFiles.length > 0) {
    console.log(chalk.blue(`📦 Found ${stagedFiles.length} staged file(s)\n`));
  }
  if (unstagedFiles.length > 0) {
    console.log(
      chalk.blue(`📝 Found ${unstagedFiles.length} unstaged file(s)\n`)
    );
  }

  const diffSpinner = ora("Analyzing changes...").start();
  let diffData;
  try {
    diffData = await git.getAllDiff();

    const hasStaged = diffData.staged && diffData.staged.trim().length > 0;
    const hasUnstaged =
      diffData.unstaged && diffData.unstaged.trim().length > 0;

    if (!hasStaged && !hasUnstaged) {
      diffSpinner.fail("No diff content found");
      console.log(
        chalk.yellow(
          `ℹ Found ${allChangedFiles.length} file(s) but no diff content (may be renames/permissions only).\n`
        )
      );
      return;
    }

    // Combine staged and unstaged diffs
    if (!hasStaged && hasUnstaged) {
      diffData.all = diffData.unstaged;
    } else if (hasStaged && !hasUnstaged) {
      diffData.all = diffData.staged;
    } else {
      diffData.all = `${diffData.staged}\n${diffData.unstaged}`.trim();
    }

    diffSpinner.succeed("Changes analyzed");
  } catch (error) {
    diffSpinner.fail(`Error: ${getErrorMessage(error)}`);
    return;
  }

  if (!diffData.all || diffData.all.trim().length === 0) {
    diffSpinner.fail("No diff content found to analyze");
    return;
  }

  const aiSpinner = ora("🤖 Generating summary with AI...").start();
  let summaryResult;
  try {
    summaryResult = await openai.generateChangesSummary(
      diffData.all,
      openaiKey
    );
    aiSpinner.succeed("Summary generated");
  } catch (error) {
    aiSpinner.fail(`OpenAI error: ${getErrorMessage(error)}`);
    return;
  }

  if (!summaryResult.summary) {
    console.log(chalk.yellow("⚠ Could not generate summary.\n"));
    return;
  }

  console.log(chalk.green.bold("\n✓ Summary Generated\n"));
  console.log(chalk.blue("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));
  console.log(chalk.white(summaryResult.summary));
  console.log(chalk.blue("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

  // If output file is specified via command line, save directly
  if (outputFile) {
    try {
      const fullPath = path.resolve(process.cwd(), outputFile);
      fs.writeFileSync(fullPath, summaryResult.summary, "utf8");
      console.log(chalk.green(`✓ Summary saved to: ${outputFile}\n`));
    } catch (error) {
      console.log(
        chalk.red(`❌ Error saving file: ${getErrorMessage(error)}\n`)
      );
    }
  } else {
    // Ask if user wants to save to file
    const { saveToFile } = await inquirer.prompt<{ saveToFile: boolean }>([
      {
        type: "confirm",
        name: "saveToFile",
        message: "Save summary to file?",
        default: false,
      },
    ]);

    if (saveToFile) {
      const { filePath } = await inquirer.prompt<{ filePath: string }>([
        {
          type: "input",
          name: "filePath",
          message: "File path (default: CHANGES_SUMMARY.md):",
          default: "CHANGES_SUMMARY.md",
        },
      ]);

      try {
        const fullPath = path.resolve(process.cwd(), filePath);
        fs.writeFileSync(fullPath, summaryResult.summary, "utf8");
        console.log(chalk.green(`✓ Summary saved to: ${filePath}\n`));
      } catch (error) {
        console.log(
          chalk.red(`❌ Error saving file: ${getErrorMessage(error)}\n`)
        );
      }
    }
  }
}
