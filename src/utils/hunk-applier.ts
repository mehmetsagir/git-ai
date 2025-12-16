/**
 * Hunk application utilities for smart commit splitting
 * Applies specific hunks to files for partial staging
 */

import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";
import { DiffHunk } from "./hunk-parser";

const git = simpleGit();

export interface FileState {
  file: string;
  originalContent: string;
  workingContent: string;
}

/**
 * Get original file content from git HEAD
 * Returns empty string for new files
 */
export async function getOriginalFileContent(
  filePath: string
): Promise<string> {
  try {
    const content = await git.show([`HEAD:${filePath}`]);
    return content;
  } catch (error) {
    // File doesn't exist in HEAD (new file)
    return "";
  }
}

/**
 * Get current working directory file content
 */
export function getWorkingFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    // File doesn't exist in working directory (deleted file)
    return "";
  }
}

/**
 * Save file states for restoration
 */
export async function saveFileStates(files: string[]): Promise<FileState[]> {
  const states: FileState[] = [];

  for (const file of files) {
    const original = await getOriginalFileContent(file);
    const working = getWorkingFileContent(file);

    states.push({
      file,
      originalContent: original,
      workingContent: working,
    });
  }

  return states;
}

/**
 * Restore files to their original state
 */
export function restoreFileStates(states: FileState[]): void {
  for (const state of states) {
    // Write original content back to working directory
    const dir = path.dirname(state.file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(state.file, state.originalContent, "utf-8");
  }
}

/**
 * Apply specific hunks to a file
 * Returns the modified file content
 */
export function applyHunksToFile(
  originalContent: string,
  hunks: DiffHunk[]
): string {
  // Split original content into lines
  const originalLines = originalContent.split("\n");

  // Process hunks in reverse order (from bottom to top)
  // This prevents line number shifts from affecting later hunks
  const sortedHunks = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

  let modifiedLines = [...originalLines];

  for (const hunk of sortedHunks) {
    // Apply hunk transformations
    modifiedLines = applyHunk(modifiedLines, hunk);
  }

  return modifiedLines.join("\n");
}

/**
 * Apply a single hunk to file lines
 */
function applyHunk(lines: string[], hunk: DiffHunk): string[] {
  const result: string[] = [];

  // Lines before the hunk (unchanged)
  for (let i = 0; i < hunk.oldStart - 1 && i < lines.length; i++) {
    result.push(lines[i]);
  }

  // Process hunk lines
  const hunkLines = hunk.lines;
  let oldLineIndex = hunk.oldStart - 1;

  for (const hunkLine of hunkLines) {
    if (hunkLine.startsWith("+")) {
      // Add new line
      result.push(hunkLine.substring(1));
    } else if (hunkLine.startsWith("-")) {
      // Skip removed line (don't add to result)
      oldLineIndex++;
    } else if (hunkLine.startsWith(" ")) {
      // Context line (unchanged)
      result.push(hunkLine.substring(1));
      oldLineIndex++;
    }
  }

  // Lines after the hunk (unchanged)
  const afterHunkStart = hunk.oldStart - 1 + hunk.oldLines;
  for (let i = afterHunkStart; i < lines.length; i++) {
    result.push(lines[i]);
  }

  return result;
}

/**
 * Apply hunks and write to working directory
 * Returns list of modified files
 */
export async function applyHunksToWorkingDirectory(
  hunks: DiffHunk[]
): Promise<string[]> {
  // Group hunks by file
  const fileHunks = new Map<string, DiffHunk[]>();
  for (const hunk of hunks) {
    const hunksForFile = fileHunks.get(hunk.file) || [];
    hunksForFile.push(hunk);
    fileHunks.set(hunk.file, hunksForFile);
  }

  const modifiedFiles: string[] = [];

  // Apply hunks to each file
  for (const [file, fileHunksArray] of fileHunks.entries()) {
    const originalContent = await getOriginalFileContent(file);
    const modifiedContent = applyHunksToFile(originalContent, fileHunksArray);

    // Write modified content to working directory
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, modifiedContent, "utf-8");

    modifiedFiles.push(file);
  }

  return modifiedFiles;
}

/**
 * Restore files to working state (after commit)
 */
export function restoreToWorkingState(states: FileState[]): void {
  for (const state of states) {
    const dir = path.dirname(state.file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(state.file, state.workingContent, "utf-8");
  }
}
