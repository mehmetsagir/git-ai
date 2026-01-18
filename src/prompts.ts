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
