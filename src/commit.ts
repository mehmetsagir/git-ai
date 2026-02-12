import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import * as config from "./config";
import * as git from "./git";
import { createAIProvider } from "./providers";
import { parseDiff, formatForAI, getStats, buildPatch, FileDiff } from "./utils/hunk-parser";
import { CommitGroup, CommitResult } from "./types";
import { getErrorMessage } from "./utils/errors";

/**
 * Resolve git user for commit author
 */
function resolveGitUser(userOption?: string): { name: string; email: string } | null {
  const users = config.getGitUsers();
  if (users.length === 0) return null;

  if (userOption) {
    const optionLower = userOption.toLowerCase().trim();
    const found = users.find(
      (u) =>
        u.id === userOption ||
        u.email.toLowerCase() === optionLower ||
        u.shortcut === optionLower ||
        u.name.toLowerCase() === optionLower
    );
    return found ? { name: found.name, email: found.email } : null;
  }

  // Use default user
  const defaultUserId = config.getDefaultGitUser();
  if (defaultUserId) {
    const defaultUser = users.find((u) => u.id === defaultUserId);
    if (defaultUser) return { name: defaultUser.name, email: defaultUser.email };
  }

  // Fallback to first user
  return { name: users[0].name, email: users[0].email };
}

export async function runCommit(userOption?: string): Promise<void> {
  console.log(chalk.blue.bold("\n🤖 Git AI\n"));

  // Check config
  const provider = config.getProvider();
  const apiKey = config.getAPIKey(provider);
  if (!apiKey) {
    console.log(chalk.yellow("⚠ Setup required. Run: git-ai setup\n"));
    return;
  }

  // Create AI provider
  const ai = createAIProvider(provider, apiKey);
  const providerName = provider === "openai" ? "OpenAI" :
                       provider === "gemini" ? "Gemini" : "z.ai";
  console.log(chalk.gray(`🤖 Using ${providerName}\n`));

  // Resolve git user
  const gitUser = resolveGitUser(userOption);
  if (gitUser) {
    console.log(chalk.gray(`👤 Author: ${gitUser.name} <${gitUser.email}>\n`));
  } else if (userOption) {
    console.log(chalk.yellow(`⚠ User "${userOption}" not found. Using git default.\n`));
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

  // Get ALL changed files from git status (including untracked)
  const allChangedFiles = await git.getChangedFiles();
  const allFilePaths = new Set(allChangedFiles.map(f => f.file));

  // Get diff and parse into hunks
  const spinner = ora("Analyzing changes...").start();
  let fileDiffs: FileDiff[];
  let formattedDiff: string;
  let stats: string;

  try {
    // Get diff for tracked files
    const rawDiff = await git.getFullDiff();

    // Parse tracked file diffs
    fileDiffs = rawDiff.trim() ? parseDiff(rawDiff) : [];

    // Add untracked files that weren't in diff
    const parsedFiles = new Set(fileDiffs.map(f => f.file));
    for (const fileInfo of allChangedFiles) {
      if (!parsedFiles.has(fileInfo.file)) {
        // This is an untracked file, add it as a simple entry
        fileDiffs.push({
          file: fileInfo.file,
          isNew: fileInfo.status === "new",
          isDeleted: fileInfo.status === "deleted",
          isBinary: fileInfo.isBinary,
          hunks: [{
            file: fileInfo.file,
            index: 0,
            header: fileInfo.status === "new" ? "[NEW]" : "[FILE]",
            content: "",
            summary: fileInfo.status === "new" ? "New file" :
                     fileInfo.status === "deleted" ? "Deleted file" : "Modified file"
          }]
        });
      }
    }

    formattedDiff = formatForAI(fileDiffs);
    stats = getStats(fileDiffs);

    const totalHunks = fileDiffs.reduce((sum, f) => sum + f.hunks.length, 0);
    spinner.succeed(`Found ${fileDiffs.length} file(s), ${totalHunks} change(s)`);
  } catch (error) {
    spinner.fail(`Error: ${getErrorMessage(error)}`);
    return;
  }

  if (fileDiffs.length === 0) {
    console.log(chalk.yellow("⚠ No changes found\n"));
    return;
  }

  // Show files
  console.log(chalk.gray("\nChanges:"));
  for (const file of fileDiffs) {
    const icon = file.isNew ? "+" : file.isDeleted ? "-" : "~";
    const suffix = file.isBinary ? " (binary)" : "";
    console.log(chalk.gray(`  ${icon} ${file.file}${suffix}`));
  }
  console.log();

  // Analyze with AI
  const aiSpinner = ora("Grouping with AI...").start();
  let result: Awaited<ReturnType<typeof ai.analyzeAndGroup>>;

  try {
    result = await ai.analyzeAndGroup(formattedDiff, stats);
    aiSpinner.succeed(`Created ${result.groups?.length || 0} commit group(s)`);
  } catch (error) {
    aiSpinner.fail(`AI error: ${getErrorMessage(error)}`);
    return;
  }

  if (!result.groups || result.groups.length === 0) {
    console.log(chalk.yellow("⚠ Could not create commit groups\n"));
    return;
  }

  // Filter groups to only include hunks that reference valid files
  const commitGroups: CommitGroup[] = [];
  const assignedHunks = new Set<string>(); // "file:hunkIndex"

  for (const group of result.groups) {
    const validHunks = group.hunks.filter(h => {
      const key = `${h.file}:${h.hunkIndex}`;
      if (!allFilePaths.has(h.file) || assignedHunks.has(key)) return false;
      assignedHunks.add(key);
      return true;
    });

    if (validHunks.length > 0) {
      commitGroups.push({
        ...group,
        hunks: validHunks,
      });
    }
  }

  // Find files that weren't assigned to any group
  const assignedFiles = new Set(commitGroups.flatMap(g => g.hunks.map(h => h.file)));
  const missingFiles: string[] = [];
  for (const filePath of allFilePaths) {
    if (!assignedFiles.has(filePath)) {
      missingFiles.push(filePath);
    }
  }

  // Add missing files to a catch-all group
  if (missingFiles.length > 0) {
    const nextGroupNumber = commitGroups.length > 0
      ? Math.max(...commitGroups.map(g => g.number)) + 1
      : 1;

    commitGroups.push({
      number: nextGroupNumber,
      description: "Remaining changes",
      hunks: missingFiles.map(f => ({ file: f, hunkIndex: 0 })),
      commitMessage: "chore: update remaining files",
    });
  }

  if (commitGroups.length === 0) {
    console.log(chalk.yellow("⚠ No valid commit groups\n"));
    return;
  }

  // Show commit plan
  console.log(chalk.blue("\n📋 Commit Plan:\n"));

  for (const group of commitGroups) {
    console.log(chalk.cyan(`${group.number}. ${group.description}`));
    const groupFiles = [...new Set(group.hunks.map(h => h.file))];
    for (const file of groupFiles) {
      const fileHunks = group.hunks.filter(h => h.file === file);
      const fileDiff = fileDiffs.find(f => f.file === file);
      const totalHunks = fileDiff?.hunks.length || 0;
      const hunkInfo = totalHunks > 1 ? ` (hunks: ${fileHunks.map(h => h.hunkIndex).join(", ")})` : "";
      console.log(chalk.gray(`   ${file}${hunkInfo}`));
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
  const results = await processCommits(commitGroups, fileDiffs, gitUser);

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

async function processCommits(
  groups: CommitGroup[],
  fileDiffs: FileDiff[],
  author?: { name: string; email: string } | null
): Promise<CommitResult[]> {
  const results: CommitResult[] = [];
  const fileDiffMap = new Map(fileDiffs.map(f => [f.file, f]));

  for (const group of groups) {
    const commitSpinner = ora(`Group ${group.number}: ${group.commitMessage}`).start();

    try {
      // Clean staging area
      await git.unstageAll();

      // Group hunks by file
      const hunksByFile = new Map<string, number[]>();
      for (const hunk of group.hunks) {
        const existing = hunksByFile.get(hunk.file) || [];
        existing.push(hunk.hunkIndex);
        hunksByFile.set(hunk.file, existing);
      }

      // Stage each file's hunks
      for (const [file, hunkIndices] of hunksByFile) {
        const fileDiff = fileDiffMap.get(file);

        // New, deleted, or binary files: stage the whole file
        if (!fileDiff || fileDiff.isNew || fileDiff.isDeleted || fileDiff.isBinary) {
          await git.stageFiles([file]);
          continue;
        }

        // If all hunks are selected, stage the whole file
        if (hunkIndices.length >= fileDiff.hunks.length) {
          await git.stageFiles([file]);
          continue;
        }

        // Partial hunk selection: build patch and apply to index
        const patch = buildPatch(fileDiff, hunkIndices);
        if (patch) {
          await git.applyPatchToIndex(patch);
        }
      }

      // Verify something is staged
      const staged = await git.getStagedFiles();
      if (staged.length === 0) {
        commitSpinner.fail(`Group ${group.number}: No changes staged`);
        results.push({
          group: group.number,
          message: group.commitMessage,
          hunks: group.hunks,
          success: false,
          error: "No changes staged",
        });
        continue;
      }

      // Create commit
      const message = group.commitBody
        ? `${group.commitMessage}\n\n${group.commitBody}`
        : group.commitMessage;

      await git.createCommit(message, author?.name, author?.email);

      const groupFiles = [...hunksByFile.keys()];
      commitSpinner.succeed(`Group ${group.number}: ${group.commitMessage}`);
      console.log(chalk.gray(`   Files: ${groupFiles.join(", ")}`));

      results.push({
        group: group.number,
        message: group.commitMessage,
        hunks: group.hunks,
        success: true,
      });
    } catch (error) {
      commitSpinner.fail(`Group ${group.number}: ${getErrorMessage(error)}`);
      results.push({
        group: group.number,
        message: group.commitMessage,
        hunks: group.hunks,
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
