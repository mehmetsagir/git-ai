# git-ai

AI-powered git commit tool that analyzes your changes, groups them logically, and creates meaningful commits following the Conventional Commits standard.

## Features

- **Smart Commit Grouping** - AI analyzes your changes and groups related files together by feature or purpose
- **Conventional Commits** - Automatically generates commit messages in standard format (`feat`, `fix`, `refactor`, `chore`, etc.)
- **Web UI** - Full web interface for selecting files, viewing diffs, and creating commits visually
- **Stash Viewer** - Browse and manage git stashes in a beautiful web UI with diff viewer
- **Safe Workflow** - Always shows a commit plan for your approval before making any changes

## Installation

```bash
npm install -g @mehmetsagir/git-ai
```

## Setup

Before using git-ai, you need to configure your OpenAI API key:

```bash
git-ai setup
```

You'll be prompted to enter your OpenAI API key. Get one from [OpenAI Platform](https://platform.openai.com/api-keys).

## Commands

### `git-ai commit`

Analyze all changes in your repository and create intelligent commits.

```bash
git-ai commit
```

**What it does:**
1. Scans all changes (staged, unstaged, and untracked files)
2. Sends diff to AI for analysis
3. Groups related files together
4. Generates commit messages for each group
5. Shows you the commit plan for approval
6. Creates commits after your confirmation

**Example output:**
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

### `git-ai stash`

Open a web-based UI to browse and manage your git stashes.

```bash
git-ai stash
```

**Features:**
- View all stashes in a clean list
- Click to see changed files and full diff
- VS Code-style split diff view (Original | Modified)
- Apply stash to your working directory
- Delete stashes you no longer need
- Syntax highlighting for code changes

### `git-ai ui`

Open a full web UI for managing commits with real-time file changes.

```bash
git-ai ui
```

**Features:**
- Real-time view of all changed files
- Select files with checkboxes
- View diff for each file
- AI analyzes selected files and creates smart commit groups
- Multiple commits from a single selection (chunks related changes)
- Review commit plan before executing
- Create commits with one click

**How it works:**
1. Select the files you want to commit
2. Click "Analyze with AI" - AI groups related changes
3. Review the proposed commit plan (may include multiple commits)
4. Click "Create Commits" to execute

### `git-ai setup`

Configure or update your OpenAI API key.

```bash
git-ai setup
```

### `git-ai reset`

Reset all configuration (removes stored API key).

```bash
git-ai reset
```

## Configuration

Configuration is stored in `~/.git-ai/config.json`:

```json
{
  "openaiKey": "sk-..."
}
```

## Requirements

- Node.js >= 14.0.0
- Git repository
- OpenAI API key

## Contributing

Contributions are welcome! Here's how you can help:

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/mehmetsagir/git-ai.git
   cd git-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build
   ```

4. **Test locally**
   ```bash
   # Run directly
   node bin/git-ai [command]

   # Or link globally
   npm link
   git-ai [command]
   ```

### Project Structure

```
src/
├── index.ts          # CLI entry point and command routing
├── git.ts            # Git operations (using simple-git)
├── openai.ts         # OpenAI API integration
├── commit.ts         # Commit workflow logic
├── stash.ts          # Stash viewer web UI
├── ui.ts             # Commit manager web UI
├── config.ts         # Configuration management
├── setup.ts          # Setup wizard
├── reset.ts          # Reset configuration
├── prompts.ts        # AI prompts for commit analysis
├── types.ts          # TypeScript type definitions
└── utils/
    ├── errors.ts     # Error handling utilities
    └── hunk-parser.ts # Diff parsing utilities
```

### Making Changes

1. Create a new branch for your feature
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and test them locally

3. Build and verify there are no TypeScript errors
   ```bash
   npm run build
   ```

4. Commit your changes using conventional commits format
   ```bash
   git commit -m "feat: add new feature"
   ```

5. Push and create a pull request
   ```bash
   git push origin feature/your-feature-name
   ```

### Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `refactor:` - Code changes that neither fix bugs nor add features
- `chore:` - Maintenance tasks
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `test:` - Adding or updating tests

### Reporting Issues

Found a bug or have a suggestion? [Open an issue](https://github.com/mehmetsagir/git-ai/issues) with:

- Clear description of the problem or suggestion
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Your environment (Node.js version, OS, etc.)

## License

MIT

## Links

- [GitHub Repository](https://github.com/mehmetsagir/git-ai)
- [npm Package](https://www.npmjs.com/package/@mehmetsagir/git-ai)
- [Report Issues](https://github.com/mehmetsagir/git-ai/issues)
