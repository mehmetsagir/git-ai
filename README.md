# Git AI

AI-powered git commit tool. Analyzes changes, groups them logically, and creates commits in Conventional Commits format.

## Features

- **Smart Grouping**: Groups related files together by feature
- **Conventional Commits**: Uses standard commit message format (feat, fix, refactor, etc.)
- **All Changes Included**: Handles tracked, untracked, new, and deleted files
- **Safe**: Shows commit plan for approval before committing

## Installation

```bash
npm install -g @mehmetsagir/git-ai
```

## Setup

```bash
git-ai setup
```

Enter your OpenAI API key when prompted.

## Usage

```bash
git-ai commit
```

The tool will:
1. Analyze all changes (staged, unstaged, and untracked)
2. Group related files by feature
3. Show commit plan for approval
4. Create commits

### Example

```
🤖 Git AI

✓ Found 5 file(s), 8 change(s)

Changes:
  + src/new-feature.ts
  ~ src/auth.ts
  ~ src/config.ts
  - src/old-file.ts

✓ Created 3 commit group(s)

📋 Commit Plan:

1. Add authentication feature
   src/auth.ts
   src/new-feature.ts
   → feat(auth): add login functionality

2. Update configuration
   src/config.ts
   → refactor(config): simplify config handling

3. Remove deprecated code
   src/old-file.ts
   → chore: remove unused files

? Proceed with commits? Yes

✓ 3 commit(s) created

⚠ Don't forget to push: git push
```

## Commands

| Command | Description |
|---------|-------------|
| `git-ai setup` | Configure OpenAI API key |
| `git-ai commit` | Analyze and create commits |
| `git-ai reset` | Reset configuration |

## Configuration

Config file: `~/.git-ai/config.json`

```json
{
  "openaiKey": "sk-..."
}
```

## Requirements

- Node.js >= 14.0.0
- OpenAI API key
- Git repository

## Changelog

### v0.0.14
**Major Refactor - Stability Release**

**Added:**
- Catch-all group for files missed by AI grouping
- Support for untracked (new) files in commit analysis
- Robust diff parser with file path validation

**Changed:**
- Simplified to file-based grouping (more reliable than hunk-based)
- Improved error handling throughout

**Removed:**
- User management features (add, list, remove users)
- Editor-based commit message editing
- Update notifier
- Hunk-level commit splitting (caused file corruption issues)
- Summary command

**Fixed:**
- Parser no longer misinterprets diff content as file names
- All changed files now included in commits (no orphaned files)
- No more "corrupt patch" errors

### v0.0.13 and earlier
- Initial releases with experimental hunk-based commit splitting

## License

MIT
