/**
 * Parse git diff into hunks for analysis
 * This module ONLY parses - it does NOT modify any files
 */

export interface Hunk {
  file: string;
  index: number;
  header: string;
  content: string;
  summary: string;
}

export interface FileDiff {
  file: string;
  isNew: boolean;
  isDeleted: boolean;
  isBinary: boolean;
  hunks: Hunk[];
}

function isValidFilePath(path: string): boolean {
  if (!path || path.length === 0) return false;
  if (path.length > 500) return false;
  if (path.includes('\n')) return false;
  if (path.includes('${')) return false;
  if (path.includes('`')) return false;
  if (path.startsWith(' ') || path.endsWith(' ')) return false;
  if (/[<>"|?*]/.test(path)) return false;
  return true;
}

export function parseDiff(diffOutput: string): FileDiff[] {
  const files: FileDiff[] = [];

  const fileParts = ('\n' + diffOutput).split(/\n(?=diff --git a\/)/);

  for (const part of fileParts) {
    if (!part.trim()) continue;

    const fileMatch = part.match(/^diff --git a\/(.+) b\/(.+)$/m);
    if (!fileMatch) continue;

    const file = fileMatch[2].trim();

    if (!isValidFilePath(file)) {
      continue;
    }

    const headerEnd = part.indexOf('@@');
    const header = headerEnd > 0 ? part.substring(0, headerEnd) : part;

    const isNew = header.includes('new file mode') || header.includes('--- /dev/null');
    const isDeleted = header.includes('deleted file mode') || header.includes('+++ /dev/null');
    const isBinary = header.includes('Binary file') || header.includes('GIT binary patch');

    const hunks: Hunk[] = [];

    if (!isBinary) {
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

        const hunkContent = part.substring(current.start, nextStart).trim();

        const lines = hunkContent.split('\n').slice(1);
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

    if (hunks.length === 0) {
      hunks.push({
        file,
        index: 0,
        header: isBinary ? '[Binary]' : '[File]',
        content: '',
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
      hunks
    });
  }

  return files;
}

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
      if (!file.isBinary && hunk.content) {
        output += hunk.content + '\n';
      }
    }
    output += '\n';
  }

  return output;
}

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
