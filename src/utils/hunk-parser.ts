/**
 * Parse git diff into hunks for analysis
 * This module ONLY parses - it does NOT modify any files
 */

export interface Hunk {
  file: string;
  index: number;
  header: string;
  content: string;  // Full hunk content including header
  summary: string;  // Brief description for AI
}

export interface FileDiff {
  file: string;
  isNew: boolean;
  isDeleted: boolean;
  isBinary: boolean;
  hunks: Hunk[];
  fullDiff: string;  // Complete diff for this file
}

/**
 * Check if a file path is valid (not garbage from diff content)
 */
function isValidFilePath(path: string): boolean {
  if (!path || path.length === 0) return false;
  if (path.length > 500) return false;  // Too long
  if (path.includes('\n')) return false;  // Contains newline
  if (path.includes('${')) return false;  // Template literal
  if (path.includes('`')) return false;  // Backtick
  if (path.startsWith(' ') || path.endsWith(' ')) return false;
  // Check for obviously invalid patterns
  if (/[<>"|?*]/.test(path)) return false;
  return true;
}

/**
 * Parse git diff output into structured format
 */
export function parseDiff(diffOutput: string): FileDiff[] {
  const files: FileDiff[] = [];

  // Split by file - only at line starts to avoid matching content inside diff
  // Prepend newline to handle first file, then split
  const fileParts = ('\n' + diffOutput).split(/\n(?=diff --git a\/)/);

  for (const part of fileParts) {
    if (!part.trim()) continue;

    // Extract file name - must be at start of part
    const fileMatch = part.match(/^diff --git a\/(.+) b\/(.+)$/m);
    if (!fileMatch) continue;

    // Use the b/ path (destination), handle renamed files
    const file = fileMatch[2].trim();

    // Validate file path
    if (!isValidFilePath(file)) {
      continue;  // Skip invalid entries
    }

    // Check flags in the header section only (before first @@)
    const headerEnd = part.indexOf('@@');
    const header = headerEnd > 0 ? part.substring(0, headerEnd) : part;

    const isNew = header.includes('new file mode') || header.includes('--- /dev/null');
    const isDeleted = header.includes('deleted file mode') || header.includes('+++ /dev/null');
    const isBinary = header.includes('Binary file') || header.includes('GIT binary patch');

    const hunks: Hunk[] = [];

    if (!isBinary) {
      // Parse hunks
      const hunkRegex = /@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@([^\n]*)/g;
      let match;
      let hunkIndex = 0;

      const matches: { start: number; header: string; context: string }[] = [];

      while ((match = hunkRegex.exec(part)) !== null) {
        matches.push({
          start: match.index,
          header: match[0],
          context: match[5]?.trim() || ''
        });
      }

      for (let i = 0; i < matches.length; i++) {
        const current = matches[i];
        const nextStart = i < matches.length - 1 ? matches[i + 1].start : part.length;

        // Extract hunk content
        const hunkContent = part.substring(current.start, nextStart).trim();

        // Create summary for AI
        const lines = hunkContent.split('\n').slice(1); // Skip header
        const additions = lines.filter(l => l.startsWith('+')).length;
        const deletions = lines.filter(l => l.startsWith('-')).length;

        let summary = '';
        if (current.context) {
          summary = current.context;
        } else if (additions > 0 && deletions > 0) {
          summary = `Modified ${additions} lines, removed ${deletions} lines`;
        } else if (additions > 0) {
          summary = `Added ${additions} lines`;
        } else if (deletions > 0) {
          summary = `Removed ${deletions} lines`;
        }

        hunks.push({
          file,
          index: hunkIndex++,
          header: current.header,
          content: hunkContent,
          summary
        });
      }
    }

    // For binary or files without hunks, create a single "hunk"
    if (hunks.length === 0) {
      hunks.push({
        file,
        index: 0,
        header: isBinary ? '[Binary]' : '[File]',
        content: part,
        summary: isBinary
          ? 'Binary file'
          : isNew
            ? 'New file'
            : isDeleted
              ? 'Deleted file'
              : 'File change'
      });
    }

    files.push({
      file,
      isNew,
      isDeleted,
      isBinary,
      hunks,
      fullDiff: part
    });
  }

  return files;
}

/**
 * Format hunks for AI analysis
 */
export function formatForAI(files: FileDiff[]): string {
  let output = '';

  for (const file of files) {
    output += `\n### FILE: ${file.file}`;
    if (file.isNew) output += ' [NEW]';
    if (file.isDeleted) output += ' [DELETED]';
    if (file.isBinary) output += ' [BINARY]';
    output += '\n';

    for (const hunk of file.hunks) {
      output += `\n--- Hunk ${hunk.index} ---\n`;
      if (hunk.summary) {
        output += `Summary: ${hunk.summary}\n`;
      }
      if (!file.isBinary) {
        output += hunk.content + '\n';
      }
    }
    output += '\n';
  }

  return output;
}

/**
 * Get diff statistics
 */
export function getStats(files: FileDiff[]): string {
  const totalFiles = files.length;
  const totalHunks = files.reduce((sum, f) => sum + f.hunks.length, 0);
  const newFiles = files.filter(f => f.isNew).length;
  const deletedFiles = files.filter(f => f.isDeleted).length;
  const binaryFiles = files.filter(f => f.isBinary).length;

  let stats = `${totalFiles} file(s), ${totalHunks} change(s)`;

  const details: string[] = [];
  if (newFiles > 0) details.push(`${newFiles} new`);
  if (deletedFiles > 0) details.push(`${deletedFiles} deleted`);
  if (binaryFiles > 0) details.push(`${binaryFiles} binary`);

  if (details.length > 0) {
    stats += ` (${details.join(', ')})`;
  }

  return stats;
}

/**
 * Create a patch string for specific hunks
 */
export function createPatch(file: FileDiff, hunkIndices: number[]): string {
  if (file.isBinary) {
    return file.fullDiff;
  }

  // Get file header (everything before first hunk)
  const firstHunkPos = file.fullDiff.indexOf('@@');
  if (firstHunkPos === -1) {
    return file.fullDiff;
  }

  const header = file.fullDiff.substring(0, firstHunkPos);

  // Get selected hunks
  const selectedHunks = file.hunks
    .filter(h => hunkIndices.includes(h.index))
    .map(h => h.content)
    .join('\n');

  return header + selectedHunks + '\n';
}
