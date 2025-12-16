/**
 * Git diff hunk parser for smart commit splitting
 * Parses git diff output into structured hunks for semantic grouping
 */

export interface DiffHunk {
  file: string;
  oldStart: number; // Starting line in old file
  oldLines: number; // Number of lines in old file
  newStart: number; // Starting line in new file
  newLines: number; // Number of lines in new file
  header: string; // @@ -10,5 +10,8 @@ function name
  lines: string[]; // Actual diff lines (+/-/ )
  context?: string; // Function/class name if available
}

export interface FileHunks {
  file: string;
  hunks: DiffHunk[];
}

/**
 * Parse git diff output into structured hunks
 */
export function parseDiffIntoHunks(diffOutput: string): FileHunks[] {
  const fileHunksMap = new Map<string, DiffHunk[]>();
  const lines = diffOutput.split("\n");

  let currentFile: string | null = null;
  let currentHunk: DiffHunk | null = null;
  let hunkLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file header: diff --git a/file b/file
    if (line.startsWith("diff --git ")) {
      // Save previous hunk if exists
      if (currentHunk && currentFile) {
        currentHunk.lines = hunkLines;
        const hunks = fileHunksMap.get(currentFile) || [];
        hunks.push(currentHunk);
        fileHunksMap.set(currentFile, hunks);
      }

      currentHunk = null;
      hunkLines = [];
      continue;
    }

    // Detect file path: +++ b/src/file.ts
    if (line.startsWith("+++ b/")) {
      currentFile = line.substring(6); // Remove "+++ b/"
      continue;
    }

    // Detect hunk header: @@ -10,5 +10,8 @@ function name
    if (line.startsWith("@@")) {
      // Save previous hunk if exists
      if (currentHunk && currentFile) {
        currentHunk.lines = hunkLines;
        const hunks = fileHunksMap.get(currentFile) || [];
        hunks.push(currentHunk);
        fileHunksMap.set(currentFile, hunks);
      }

      // Parse hunk header
      const hunk = parseHunkHeader(line, currentFile || "");
      currentHunk = hunk;
      hunkLines = [];
      continue;
    }

    // Collect hunk lines (starts with +, -, or space)
    if (
      currentHunk &&
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))
    ) {
      hunkLines.push(line);
    }
  }

  // Save last hunk
  if (currentHunk && currentFile) {
    currentHunk.lines = hunkLines;
    const hunks = fileHunksMap.get(currentFile) || [];
    hunks.push(currentHunk);
    fileHunksMap.set(currentFile, hunks);
  }

  // Convert map to array
  const result: FileHunks[] = [];
  fileHunksMap.forEach((hunks, file) => {
    result.push({ file, hunks });
  });

  return result;
}

/**
 * Parse hunk header line
 * Format: @@ -10,5 +10,8 @@ optional context
 */
function parseHunkHeader(headerLine: string, file: string): DiffHunk {
  const match = headerLine.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)$/);

  if (!match) {
    return {
      file,
      oldStart: 0,
      oldLines: 0,
      newStart: 0,
      newLines: 0,
      header: headerLine,
      lines: [],
    };
  }

  const oldStart = parseInt(match[1], 10);
  const oldLines = match[2] ? parseInt(match[2], 10) : 1;
  const newStart = parseInt(match[3], 10);
  const newLines = parseInt(match[4], 10) || 1;
  const context = match[5]?.trim() || undefined;

  return {
    file,
    oldStart,
    oldLines,
    newStart,
    newLines,
    header: headerLine,
    context,
    lines: [],
  };
}

/**
 * Format hunks for AI analysis
 * Creates a readable representation of hunks with metadata
 */
export function formatHunksForAI(fileHunks: FileHunks[]): string {
  let output = "";

  fileHunks.forEach((fh) => {
    output += `\n=== FILE: ${fh.file} ===\n`;
    output += `Total hunks: ${fh.hunks.length}\n\n`;

    fh.hunks.forEach((hunk, idx) => {
      output += `--- Hunk ${idx + 1} ---\n`;
      if (hunk.context) {
        output += `Context: ${hunk.context}\n`;
      }
      output += `Lines: ${hunk.oldStart}-${hunk.oldStart + hunk.oldLines - 1} → ${hunk.newStart}-${hunk.newStart + hunk.newLines - 1}\n`;
      output += hunk.header + "\n";
      output += hunk.lines.join("\n") + "\n\n";
    });
  });

  return output;
}

/**
 * Create a unified diff string from specific hunks
 * Used for applying partial changes
 */
export function createPatchFromHunks(hunks: DiffHunk[]): string {
  if (hunks.length === 0) return "";

  const fileGroups = new Map<string, DiffHunk[]>();
  hunks.forEach((hunk) => {
    const group = fileGroups.get(hunk.file) || [];
    group.push(hunk);
    fileGroups.set(hunk.file, group);
  });

  let patch = "";

  fileGroups.forEach((fileHunks, file) => {
    patch += `diff --git a/${file} b/${file}\n`;
    patch += `--- a/${file}\n`;
    patch += `+++ b/${file}\n`;

    fileHunks.forEach((hunk) => {
      patch += hunk.header + "\n";
      patch += hunk.lines.join("\n") + "\n";
    });
  });

  return patch;
}

/**
 * Get summary of hunks for display
 */
export function getHunksSummary(fileHunks: FileHunks[]): string {
  const totalHunks = fileHunks.reduce((sum, fh) => sum + fh.hunks.length, 0);
  const totalFiles = fileHunks.length;

  return `${totalFiles} file(s), ${totalHunks} change block(s)`;
}

