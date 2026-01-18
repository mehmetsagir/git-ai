import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import * as config from "./config";
import * as git from "./git";
import * as openai from "./openai";
import { parseDiff, formatForAI, getStats, FileDiff } from "./utils/hunk-parser";
import { CommitResult } from "./types";
import { getErrorMessage } from "./utils/errors";

export async function runCommit(): Promise<void> {
  console.log(chalk.blue.bold("\n🤖 Git AI\n"));

  // Check config
  const apiKey = config.getOpenAIKey();
  if (!apiKey) {
    console.log(chalk.yellow("⚠ Setup required. Run: git-ai setup\n"));
    return;
  }

  // Check git repo
  if (!(await git.isGitRepository())) {
    console.log(chalk.red("❌ Not a git repository\n"));
    return;
  }

  // Check for changes
  if (!(await git.hasChanges())) {
    console.log(chalk.yellow("⚠ No changes to commit\n"));
    return;
  }

  // Get diff and parse into hunks
  const spinner = ora("Analyzing changes...").start();
  let fileDiffs: FileDiff[];
  let formattedDiff: string;
  let stats: string;

  try {
    const rawDiff = await git.getFullDiff();

    if (!rawDiff.trim()) {
      spinner.fail("No diff found");
      return;
    }

    fileDiffs = parseDiff(rawDiff);
    formattedDiff = formatForAI(fileDiffs);
    stats = getStats(fileDiffs);

    const totalHunks = fileDiffs.reduce((sum, f) => sum + f.hunks.length, 0);
    spinner.succeed(`Found ${fileDiffs.length} file(s), ${totalHunks} change(s)`);
  } catch (error) {
    spinner.fail(`Error: ${getErrorMessage(error)}`);
    return;
  }

  // Show files and hunks
  console.log(chalk.gray("\nChanges:"));
  for (const file of fileDiffs) {
    const icon = file.isNew ? "+" : file.isDeleted ? "-" : "~";
    const suffix = file.isBinary ? " (binary)" : ` (${file.hunks.length} hunk${file.hunks.length > 1 ? "s" : ""})`;
    console.log(chalk.gray(`  ${icon} ${file.file}${suffix}`));
  }
  console.log();

  // Analyze with AI
  const aiSpinner = ora("Grouping with AI...").start();
  let result: Awaited<ReturnType<typeof openai.analyzeAndGroup>>;

  try {
    result = await openai.analyzeAndGroup(formattedDiff, stats, apiKey);
    aiSpinner.succeed(`Created ${result.groups?.length || 0} commit group(s)`);
  } catch (error) {
    aiSpinner.fail(`AI error: ${getErrorMessage(error)}`);
    return;
  }

  if (!result.groups || result.groups.length === 0) {
    console.log(chalk.yellow("⚠ Could not create commit groups\n"));
    return;
  }

  // Convert hunk-based groups to file-based groups
  // Each file goes to the FIRST group that references any of its hunks
  const fileToGroup = new Map<string, number>();
  const fileBasedGroups: Array<{
    number: number;
    description: string;
    files: string[];
    commitMessage: string;
    commitBody?: string;
  }> = [];

  for (const group of result.groups) {
    const filesInGroup: string[] = [];

    for (const hunk of group.hunks) {
      // If this file hasn't been assigned yet, assign to this group
      if (!fileToGroup.has(hunk.file)) {
        fileToGroup.set(hunk.file, group.number);
        filesInGroup.push(hunk.file);
      }
    }

    if (filesInGroup.length > 0) {
      fileBasedGroups.push({
        number: group.number,
        description: group.description,
        files: filesInGroup,
        commitMessage: group.commitMessage,
        commitBody: group.commitBody,
      });
    }
  }

  if (fileBasedGroups.length === 0) {
    console.log(chalk.yellow("⚠ No valid commit groups\n"));
    return;
  }

  // Show commit plan
  console.log(chalk.blue("\n📋 Commit Plan:\n"));

  for (const group of fileBasedGroups) {
    console.log(chalk.cyan(`${group.number}. ${group.description}`));
    for (const file of group.files) {
      console.log(chalk.gray(`   ${file}`));
    }
    console.log(chalk.yellow(`   → ${group.commitMessage}`));
    console.log();
  }

  // Get approval
  const { approved } = await inquirer.prompt<{ approved: boolean }>([
    {
      type: "confirm",
      name: "approved",
      message: "Proceed with commits?",
      default: true,
    },
  ]);

  if (!approved) {
    console.log(chalk.yellow("\n❌ Cancelled\n"));
    return;
  }

  // Process commits
  console.log(chalk.blue("\n📦 Creating commits...\n"));
  const results = await processCommits(fileBasedGroups);

  // Summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(chalk.blue.bold("\n📊 Summary\n"));
  console.log(chalk.green(`✓ ${successful} commit(s) created`));
  if (failed > 0) {
    console.log(chalk.red(`✗ ${failed} failed`));
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(chalk.red(`  - Group ${r.group}: ${r.error}`));
      });
  }

  console.log(chalk.yellow("\n⚠ Don't forget to push: git push\n"));
}

interface FileBasedGroup {
  number: number;
  description: string;
  files: string[];
  commitMessage: string;
  commitBody?: string;
}

async function processCommits(groups: FileBasedGroup[]): Promise<CommitResult[]> {
  const results: CommitResult[] = [];
  const committedFiles = new Set<string>();

  // First, unstage everything
  await git.unstageAll();

  for (const group of groups) {
    // Filter to only files that haven't been committed yet
    const filesToCommit = group.files.filter((f) => !committedFiles.has(f));

    if (filesToCommit.length === 0) {
      console.log(chalk.yellow(`⚠ Group ${group.number}: No files to commit, skipping`));
      results.push({
        group: group.number,
        message: group.commitMessage,
        hunks: [],
        success: false,
        error: "No valid files",
      });
      continue;
    }

    const commitSpinner = ora(`Group ${group.number}: ${group.commitMessage}`).start();

    try {
      // Stage files for this group
      await git.stageFiles(filesToCommit);

      // Verify files are staged
      const staged = await git.getStagedFiles();
      if (staged.length === 0) {
        commitSpinner.fail(`Group ${group.number}: No files staged`);
        results.push({
          group: group.number,
          message: group.commitMessage,
          hunks: filesToCommit.map((f) => ({ file: f, hunkIndex: 0 })),
          success: false,
          error: "Failed to stage files",
        });
        continue;
      }

      // Create commit
      const message = group.commitBody
        ? `${group.commitMessage}\n\n${group.commitBody}`
        : group.commitMessage;

      await git.createCommit(message);

      // Mark files as committed
      filesToCommit.forEach((f) => committedFiles.add(f));

      commitSpinner.succeed(`Group ${group.number}: ${group.commitMessage}`);
      console.log(chalk.gray(`   Files: ${filesToCommit.join(", ")}`));

      results.push({
        group: group.number,
        message: group.commitMessage,
        hunks: filesToCommit.map((f) => ({ file: f, hunkIndex: 0 })),
        success: true,
      });
    } catch (error) {
      commitSpinner.fail(`Group ${group.number}: ${getErrorMessage(error)}`);
      results.push({
        group: group.number,
        message: group.commitMessage,
        hunks: filesToCommit.map((f) => ({ file: f, hunkIndex: 0 })),
        success: false,
        error: getErrorMessage(error),
      });

      // Try to unstage for next group
      try {
        await git.unstageAll();
      } catch {
        // Ignore
      }
    }
  }

  return results;
}
