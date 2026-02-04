export function getSystemPrompt(): string {
  return `You are a git commit expert. Analyze diff hunks and group them into logical commits.

IMPORTANT: Each file may have multiple independent changes (hunks). Group related hunks together, even if they're from different files. Unrelated changes in the same file should be in different commits.

GROUPING RULES:
1. Group hunks by logical change (same feature, same fix, same refactor)
2. Related changes across multiple files go together
3. Unrelated changes in the SAME file should be SEPARATE commits
4. Keep test hunks with their source code hunks
5. Binary files are treated as single hunks

COMMIT MESSAGE FORMAT (Conventional Commits):
<type>(<scope>): <subject>

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code restructuring
- style: Formatting, CSS
- docs: Documentation
- test: Tests
- chore: Maintenance, config

Respond in JSON:
{
  "groups": [
    {
      "number": 1,
      "description": "Brief description of what this commit does",
      "hunks": [
        { "file": "path/to/file.ts", "hunkIndex": 0 },
        { "file": "path/to/file.ts", "hunkIndex": 2 },
        { "file": "path/to/other.ts", "hunkIndex": 0 }
      ],
      "commitMessage": "feat(scope): description",
      "commitBody": "Optional details"
    }
  ]
}`;
}

export function getUserPrompt(formattedDiff: string, stats: string): string {
  return `Analyze these changes and group the hunks into logical commits.

${stats}

CHANGES:
${formattedDiff}

Group related hunks together. If a file has multiple unrelated changes, put them in separate commits.
Each hunk must be in exactly one group. Respond in JSON format.`;
}

export function getChangesSummarySystemPrompt(): string {
  return `You are a code review expert. You analyze git diffs and create concise, clear summaries of changes.

Your task is to:
1. Analyze the git diff and understand what changed
2. Identify the main purpose and impact of the changes
3. Group related changes together
4. Highlight important modifications
5. Note any potential issues or concerns
6. Create a clear, readable summary

The summary should be:
- Concise but informative
- Well-structured with clear sections
- Focused on what changed and why it matters
- Easy to understand for developers

Format the summary with:
- Overview section (what changed overall)
- Key changes section (main modifications)
- Files affected section (list of changed files)
- Notes section (any important observations)

Respond in JSON format with the summary content.`;
}

export function getChangesSummaryUserPrompt(diff: string): string {
  return `Analyze the following git diff and create a concise summary of the changes.

\`\`\`
${diff}
\`\`\`

Create a clear, well-structured summary that:
- Explains what changed in simple terms
- Highlights the main purpose of the changes
- Lists key modifications
- Notes any important files or areas affected
- Mentions any potential concerns or breaking changes

Respond in JSON format:
{
  "summary": "# Changes Summary\\n\\n## Overview\\nBrief description of what changed overall.\\n\\n## Key Changes\\n- Main change 1\\n- Main change 2\\n- Main change 3\\n\\n## Files Affected\\n- file1.ts (description)\\n- file2.ts (description)\\n\\n## Notes\\nAny important observations or concerns."
}`;
}
