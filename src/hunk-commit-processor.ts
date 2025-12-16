/**
 * Hunk-based commit processor for smart commit splitting
 * Allows splitting changes within a single file into multiple commits
 */

import chalk from "chalk";
import ora from "ora";
import * as git from "./git";
import { HunkCommitGroup, CommitResult, GitUserInfo } from "./types";
import { DiffHunk, FileHunks } from "./utils/hunk-parser";
import * as hunkApplier from "./utils/hunk-applier";
import { getErrorMessage } from "./utils/errors";

interface ProcessResult {
  success: boolean;
  filesProcessed: string[];
  message?: string;
  error?: string;
}

/**
 * Process and commit a single hunk group
 */
async function processHunkCommitGroup(
  group: HunkCommitGroup,
  allFileHunks: FileHunks[],
  selectedUser: GitUserInfo | null,
  fileStates: hunkApplier.FileState[]
): Promise<ProcessResult> {
  console.log(
    chalk.cyan(`\n📦 Processing Group ${group.number}: ${group.description}`)
  );

  // Get hunks for this group
  const hunksToApply: DiffHunk[] = [];
  for (const hunkId of group.hunks) {
    const fileHunks = allFileHunks.find((fh) => fh.file === hunkId.file);
    if (!fileHunks) {
      console.log(
        chalk.yellow(`⚠ File not found: ${hunkId.file}, skipping hunk`)
      );
      continue;
    }

    const hunk = fileHunks.hunks[hunkId.hunkIndex];
    if (!hunk) {
      console.log(
        chalk.yellow(
          `⚠ Hunk ${hunkId.hunkIndex} not found in ${hunkId.file}, skipping`
        )
      );
      continue;
    }

    hunksToApply.push(hunk);
  }

  if (hunksToApply.length === 0) {
    console.log(
      chalk.yellow(`⚠ Group ${group.number}: No valid hunks, skipping.\n`)
    );
    return { success: false, filesProcessed: [] };
  }

  // Get unique files affected by these hunks
  const affectedFiles = Array.from(
    new Set(hunksToApply.map((h) => h.file))
  );

  // Restore files to original state
  const statesForFiles = fileStates.filter((s) =>
    affectedFiles.includes(s.file)
  );
  hunkApplier.restoreFileStates(statesForFiles);

  // Apply hunks to working directory
  const applySpinner = ora(
    `Group ${group.number}: Applying ${hunksToApply.length} hunk(s)...`
  ).start();
  try {
    await hunkApplier.applyHunksToWorkingDirectory(hunksToApply);
    applySpinner.succeed(
      `Group ${group.number}: Applied ${hunksToApply.length} hunk(s)`
    );
  } catch (error) {
    applySpinner.fail(
      `Group ${group.number}: Error applying hunks: ${getErrorMessage(error)}`
    );
    return { success: false, filesProcessed: affectedFiles };
  }

  // Stage modified files
  const stageSpinner = ora(
    `Group ${group.number}: Staging ${affectedFiles.length} file(s)...`
  ).start();
  try {
    await git.stageFiles(affectedFiles);
    stageSpinner.succeed(`Group ${group.number}: Files staged`);
  } catch (error) {
    stageSpinner.fail(
      `Group ${group.number}: Error staging files: ${getErrorMessage(error)}`
    );
    return { success: false, filesProcessed: affectedFiles };
  }

  // Set git user if provided
  if (selectedUser?.name && selectedUser?.email) {
    try {
      const currentUser = await git.getGitUserInfo();
      const needsChange =
        currentUser.name !== selectedUser.name ||
        currentUser.email !== selectedUser.email;

      if (needsChange) {
        await git.setGitUser(selectedUser.name, selectedUser.email, "local");
        console.log(
          chalk.green(
            `✓ Group ${group.number}: Git user changed to ${selectedUser.name} <${selectedUser.email}>\n`
          )
        );
      }
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠ Group ${group.number}: Failed to set git user: ${getErrorMessage(
            error
          )}\n`
        )
      );
    }
  }

  // Create commit
  const fullMessage = group.commitBody
    ? `${group.commitMessage}\n\n${group.commitBody}`
    : group.commitMessage;

  const commitSpinner = ora(
    `Group ${group.number}: Creating commit "${group.commitMessage}"...`
  ).start();
  try {
    await git.createCommit(
      fullMessage,
      selectedUser?.name || null,
      selectedUser?.email || null
    );

    commitSpinner.succeed(
      `Group ${group.number}: Committed - ${group.commitMessage}`
    );
    return {
      success: true,
      filesProcessed: affectedFiles,
      message: group.commitMessage,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    commitSpinner.fail(
      `Group ${group.number}: Commit error - ${errorMessage}`
    );
    return {
      success: false,
      filesProcessed: affectedFiles,
      message: group.commitMessage,
      error: errorMessage,
    };
  }
}

/**
 * Process all hunk commit groups
 */
export async function processAllHunkCommitGroups(
  groups: HunkCommitGroup[],
  allFileHunks: FileHunks[],
  selectedUser: GitUserInfo | null
): Promise<CommitResult[]> {
  console.log(chalk.blue(`\n📦 Creating ${groups.length} commits...\n`));

  // Get all unique files affected
  const allFiles = Array.from(
    new Set(groups.flatMap((g) => g.hunks.map((h) => h.file)))
  );

  // Save file states for restoration
  const prepareSpinner = ora("Saving file states...").start();
  const fileStates = await hunkApplier.saveFileStates(allFiles);
  prepareSpinner.succeed(`Saved state for ${fileStates.length} file(s)`);

  const commitResults: CommitResult[] = [];

  try {
    for (const group of groups) {
      const result = await processHunkCommitGroup(
        group,
        allFileHunks,
        selectedUser,
        fileStates
      );

      commitResults.push({
        group: group.number,
        message: result.message || group.commitMessage,
        files: result.filesProcessed?.length || 0,
        success: result.success,
        error: result.error,
      });

      // Unstage any remaining files after each commit
      try {
        await git.unstageAll();
      } catch {
        // Continue even if error
      }
    }
  } finally {
    // Restore all files to working state
    const restoreSpinner = ora("Restoring working state...").start();
    hunkApplier.restoreToWorkingState(fileStates);
    restoreSpinner.succeed("Working state restored");
  }

  return commitResults;
}

