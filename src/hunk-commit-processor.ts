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
  selectedUser: GitUserInfo | null
): Promise<ProcessResult> {
  console.log(
    chalk.cyan(`\n📦 Processing Group ${group.number}: ${group.description}`)
  );

  // Collect the hunks for this group
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

  const affectedFiles = Array.from(new Set(hunksToApply.map((h) => h.file)));

  // Reset files to HEAD so we apply cleanly
  try {
    await git.resetFilesToHead(affectedFiles);
  } catch (error) {
    console.log(
      chalk.yellow(
        `⚠ Group ${group.number}: Could not reset files to HEAD: ${getErrorMessage(
          error
        )}`
      )
    );
  }

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
    commitSpinner.fail(`Group ${group.number}: Commit error - ${errorMessage}`);
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

  const allFiles = Array.from(
    new Set(groups.flatMap((g) => g.hunks.map((h) => h.file)))
  );

  const prepareSpinner = ora("Saving working state...").start();
  const fileStates = await hunkApplier.saveFileStates(allFiles);
  prepareSpinner.succeed(`Saved state for ${fileStates.length} file(s)`);

  const commitResults: CommitResult[] = [];
  const committedHunks = new Set<string>();

  try {
    for (const group of groups) {
      const result = await processHunkCommitGroup(
        group,
        allFileHunks,
        selectedUser
      );

      commitResults.push({
        number: group.number,
        description: group.description,
        files: result.filesProcessed,
        message: result.message || group.commitMessage,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        group.hunks.forEach((h) => {
          committedHunks.add(`${h.file}:${h.hunkIndex}`);
        });
      }

      try {
        await git.unstageAll();
      } catch (error) {
        console.log(
          chalk.yellow(
            `⚠ Warning: Could not unstage files: ${getErrorMessage(error)}`
          )
        );
      }
    }
  } finally {
    // Restore any uncommitted hunks to working directory
    const restoreSpinner = ora("Restoring uncommitted changes...").start();

    const uncommittedHunks: DiffHunk[] = [];
    allFileHunks.forEach((fileHunk) => {
      fileHunk.hunks.forEach((hunk, index) => {
        const hunkKey = `${fileHunk.file}:${index}`;
        if (!committedHunks.has(hunkKey)) {
          uncommittedHunks.push(hunk);
        }
      });
    });

    try {
      // Reset files to HEAD first
      await git.resetFilesToHead(allFiles);
      if (uncommittedHunks.length > 0) {
        await hunkApplier.applyHunksToWorkingDirectory(uncommittedHunks);
        restoreSpinner.succeed(
          `Restored ${uncommittedHunks.length} uncommitted change(s)`
        );
      } else {
        restoreSpinner.succeed("All changes committed");
      }
    } catch (error) {
      restoreSpinner.fail(
        `Failed to restore uncommitted changes: ${getErrorMessage(error)}`
      );
      console.log(
        chalk.yellow(
          "\n⚠️  Some uncommitted changes may have been lost. Check git status.\n"
        )
      );
    }

    // Restore working tree content for unaffected files
    try {
      hunkApplier.restoreToWorkingState(fileStates);
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠ Warning: Could not restore working state: ${getErrorMessage(
            error
          )}`
        )
      );
    }
  }

  return commitResults;
}
