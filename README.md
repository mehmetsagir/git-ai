# Git AI

AI-powered git commit tool. Analyzes changes, groups them logically, and creates commits in Conventional Commits format.

## Features

- **Smart Commit Splitting**: Groups changes by feature, not by file
- **Hunk-Level Analysis**: One file can be split into multiple commits
- **Conventional Commits**: Uses standard commit message format
- **Safe**: Commits are not pushed automatically

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
1. Analyze all changes (staged or unstaged)
2. Group related changes by feature
3. Show commit plan for approval
4. Create commits

### Example

```
🤖 Git AI

📝 3 unstaged file(s)

✓ Parsed: 2 file(s), 4 change block(s)
✓ Created 2 commit groups

📋 Commit Plan:

Group 1: Login feature
  Files: src/auth.ts, src/auth.test.ts
  Commit: feat(auth): add login functionality

Group 2: Logger configuration
  Files: src/auth.ts, src/logger.ts
  Commit: feat(logging): add info logging

? Proceed with commits? Yes

✓ 2 commit(s) created

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

## License

MIT
