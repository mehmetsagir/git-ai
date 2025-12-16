import * as fs from "fs";
import { CommitGroup } from "../types";

const SEPARATOR = "# ========";
const COMMENT_PREFIX = "#";

/**
 * Write commit groups to a file for editing
 */
export function writeCommitFile(
  filePath: string,
  groups: CommitGroup[]
): void {
  const lines: string[] = [];

  // Header
  lines.push("# Git-AI Commit Messages");
  lines.push(
    "# Edit the commit messages below. Lines starting with # are ignored."
  );
  lines.push(`# Each commit is separated by: ${SEPARATOR}`);
  lines.push("#");
  lines.push(
    "# Format: First line is the commit message (max 72 chars recommended)"
  );
  lines.push("#         Followed by an empty line and detailed body (optional)");
  lines.push("#");
  lines.push(
    "# TIP: You can delete a commit section entirely to skip that commit."
  );
  lines.push("");

  // Write each group
  groups.forEach((group, index) => {
    if (index > 0) {
      lines.push("");
      lines.push(SEPARATOR);
      lines.push("");
    }

    // Group metadata as comments
    lines.push(`# Group ${group.number}: ${group.description}`);
    lines.push(`# Files: ${group.files.join(", ")}`);

    // Commit message
    lines.push(group.commitMessage);

    // Commit body (if exists)
    if (group.commitBody && group.commitBody.trim()) {
      lines.push("");
      lines.push(group.commitBody);
    }
  });

  // Write to file
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

/**
 * Parse edited commit file and extract commit messages
 */
export function parseCommitFile(filePath: string): Array<{
  message: string;
  body?: string;
}> {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  const commits: Array<{ message: string; body?: string }> = [];
  let currentCommit: string[] = [];
  let inCommit = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment lines
    if (line.trim().startsWith(COMMENT_PREFIX)) {
      continue;
    }

    // Check for separator
    if (line.trim() === SEPARATOR.substring(2).trim()) {
      // Save current commit if exists
      if (currentCommit.length > 0) {
        commits.push(parseCommitLines(currentCommit));
        currentCommit = [];
        inCommit = false;
      }
      continue;
    }

    // Collect commit lines
    if (line.trim() || inCommit) {
      currentCommit.push(line);
      if (line.trim()) {
        inCommit = true;
      }
    }
  }

  // Save last commit
  if (currentCommit.length > 0) {
    commits.push(parseCommitLines(currentCommit));
  }

  return commits;
}

/**
 * Parse individual commit lines into message and body
 */
function parseCommitLines(lines: string[]): { message: string; body?: string } {
  // Remove leading/trailing empty lines
  while (lines.length > 0 && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length > 0 && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  if (lines.length === 0) {
    return { message: "" };
  }

  // First non-empty line is the message
  const message = lines[0].trim();

  // Rest is the body (skip first empty line separator)
  let bodyStartIndex = 1;
  while (bodyStartIndex < lines.length && !lines[bodyStartIndex].trim()) {
    bodyStartIndex++;
  }

  if (bodyStartIndex >= lines.length) {
    return { message };
  }

  const bodyLines = lines.slice(bodyStartIndex);
  const body = bodyLines.join("\n").trim();

  return {
    message,
    body: body || undefined,
  };
}

/**
 * Validate parsed commits
 */
export function validateCommits(
  commits: Array<{ message: string; body?: string }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (commits.length === 0) {
    errors.push("No commits found in file");
    return { valid: false, errors };
  }

  commits.forEach((commit, index) => {
    if (!commit.message || !commit.message.trim()) {
      errors.push(`Commit ${index + 1}: Empty commit message`);
    } else if (commit.message.length > 100) {
      errors.push(
        `Commit ${index + 1}: Message too long (${commit.message.length} chars, max 100 recommended)`
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge edited commits back into groups
 */
export function mergeEditedCommits(
  originalGroups: CommitGroup[],
  editedCommits: Array<{ message: string; body?: string }>
): CommitGroup[] {
  const updatedGroups: CommitGroup[] = [];

  const minLength = Math.min(originalGroups.length, editedCommits.length);

  for (let i = 0; i < minLength; i++) {
    const group = originalGroups[i];
    const edited = editedCommits[i];

    // Skip empty commits (deleted by user)
    if (!edited.message || !edited.message.trim()) {
      continue;
    }

    updatedGroups.push({
      ...group,
      commitMessage: edited.message,
      commitBody: edited.body || group.commitBody,
    });
  }

  return updatedGroups;
}
