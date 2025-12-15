# Git AI

AI-powered git commit tool. Analyzes git diffs, groups them logically, and creates commit messages in Conventional Commits standard.

## Features

- 🤖 **AI-Powered Analysis**: Analyzes git diffs with OpenAI
- 📦 **Smart Grouping**: Groups changes logically
- 📝 **Conventional Commits**: Uses standard commit message format
- 👤 **Multiple Git User Support**: Manages multiple git user profiles
- 📊 **Changes Summary**: Get AI-powered summaries of your current changes
- 🔒 **Secure**: Commits are not pushed automatically, provides manual control

## Installation

### Global Installation

```bash
npm install -g @mehmetsagir/git-ai
```

After installation, you can use `git-ai` command directly:

```bash
git-ai setup
git-ai commit
```

### Using with npx (no installation required)

```bash
npx @mehmetsagir/git-ai setup
npx @mehmetsagir/git-ai commit
```

## Initial Setup

Run the setup command on first use:

```bash
# If installed globally
git-ai setup

# Or with npx
npx @mehmetsagir/git-ai setup
```

This command:

- Asks for your OpenAI API key
- Detects your git user profiles
- Allows you to select a default git user
- Saves configuration to `~/.git-ai/config.json`

## Usage

### Creating Commits

**With default user:**

```bash
# If installed globally
git-ai commit

# Or with npx
npx @mehmetsagir/git-ai commit
```

**With a different user:**

```bash
# Using shortcut (easiest method - single or multi-character)
git-ai commit --user my
git-ai commit --user g
git-ai commit --user work
git-ai commit -u personal

# Using email
git-ai commit --user user@example.com

# Using user ID (ID shown during setup)
git-ai commit --user global-user@example.com
```

This command:

1. Analyzes git diffs (staged + unstaged)
2. Groups changes with OpenAI
3. Creates Conventional Commits format messages for each group
4. Shows commit plan and asks for confirmation
5. Creates each group as a separate commit after approval
6. **Does not push** - you need to push manually

### Example Output

```
🤖 Git Commit AI

✓ Changes analyzed

✓ Analysis complete: 3 groups created

✓ 3 groups created

📋 Commit Plan:

Group 1: Authentication feature
Files: auth.ts, auth.test.ts
Commit: feat(auth): add OAuth2 authentication support
  Added OAuth2 authentication support. Implemented token refresh mechanism.

Group 2: UI component updates
Files: Button.tsx, Input.tsx, styles.css
Commit: style(ui): update design system colors
  Updated design system colors. Improved dark mode support.

Group 3: API endpoint refactoring
Files: api/users.ts, api/types.ts
Commit: refactor(api): simplify user endpoint logic
  Simplified user endpoint logic. Improved error handling.

Do you approve this commit plan? (Y/n)
```

## Conventional Commits Format

The tool uses the [Conventional Commits](https://www.conventionalcommits.org/) standard:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `style`: Formatting, styling changes
- `docs`: Documentation
- `test`: Tests
- `chore`: Maintenance tasks

## Git User Management

The tool allows you to manage multiple git user profiles:

- Automatic detection from global and local git configs
- List active git users
- Default user selection (during setup)
- Manual profile addition
- Different user selection during commit with `--user` or `-u` flag

### User Management During Setup

When running the setup command:

1. **Active git user profiles are listed:**

   ```
   📋 Active Git User Profiles:
     1. John Doe <john@example.com> (Global) [shortcut: g]
     2. Jane Smith <jane@example.com> (Local) [shortcut: t]
   ```

2. **Shortcuts can be added for each user:**

   - "Would you like to add a shortcut?" question is asked for each user
   - Shortcut key is entered (can be single or multi-character, e.g., `g`, `my`, `work`, `personal`)
   - Shortcuts can be used during commit

3. **Default user is selected:**

   - Automatically selected if there's only one user
   - Selection is made if there are multiple users

4. **Optionally, more profiles can be added**

5. **Default user can be updated after adding new profiles**

### User Selection During Commit

**Default usage:**

```bash
git-ai commit
# Uses default user from config
```

**With different user:**

```bash
# Using shortcut (easiest - recommended, single or multi-character)
git-ai commit --user my
git-ai commit --user work
git-ai commit -u personal

# Using email address
git-ai commit --user jane@example.com

# Short form
git-ai commit -u jane@example.com

# Using user ID (ID shown during setup)
git-ai commit --user local-jane@example.com
```

**To view current users:**

```bash
git-ai list
# or
git-ai users
```

## Commands

All commands can be used with `git-ai` (if installed globally) or `npx @mehmetsagir/git-ai`:

### Setup

```bash
git-ai setup
# or
npx @mehmetsagir/git-ai setup
```

Initial setup - OpenAI API key and git user configuration.

### Commit

```bash
git-ai commit [--user <user>]
# or
npx @mehmetsagir/git-ai commit [--user <user>]
```

Analyze git diffs and create commits. Use `--user` or `-u` to specify a different git user.

### Add User

```bash
git-ai add
# or
git-ai add-user
```

Add a new git user profile.

### List Users

```bash
git-ai list
# or
git-ai users
```

List all configured git user profiles.

### Remove User

```bash
git-ai remove
# or
git-ai delete
```

Remove a git user profile interactively.

### Reset

```bash
git-ai reset
```

Reset all configuration (deletes OpenAI key and all git users).

### Update

```bash
git-ai --update
```

Check for updates and update to the latest version. The tool also automatically checks for updates in the background and will notify you if a new version is available.

### Summary

```bash
git-ai summary [options]
# or
git-ai sum [options]
```

Generate a concise AI-powered summary of your current changes (staged and unstaged).

**Options:**

- `-o, --output <file>`: Output file path (default: CHANGES_SUMMARY.md)

**What it does:**

- Analyzes your git diff (staged + unstaged changes)
- Creates a clear, structured summary of what changed
- Highlights key modifications and affected files
- Does NOT create commits - just shows a summary
- Optionally saves to a file (asks interactively or use `--output` flag)

**Examples:**

```bash
# Generate summary and display in terminal
git-ai summary

# Generate summary and save directly to file
git-ai summary --output CHANGES_SUMMARY.md

# Generate summary and choose file interactively
git-ai summary
# Then answer "Yes" when asked to save to file
```

**Example output:**

```
📊 Changes Summary

✓ Summary Generated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Changes Summary

## Overview
Added user authentication feature with OAuth2 support and updated UI components.

## Key Changes
- Implemented OAuth2 authentication flow
- Added user profile management
- Updated login UI components
- Added authentication tests

## Files Affected
- src/auth.ts (OAuth2 implementation)
- src/user.ts (User profile management)
- src/components/Login.tsx (UI updates)
- src/auth.test.ts (Test coverage)

## Notes
- Breaking change: Authentication API endpoints changed
- Requires environment variable configuration
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

This is useful for:

- Quick review before committing
- Understanding what changed in your working directory
- Sharing changes with team members
- Preparing commit messages manually

## Example Scenario

1. **Run setup:**

   ```bash
   # If installed globally
   git-ai setup

   # Or with npx
   npx @mehmetsagir/git-ai setup
   ```

   - 3 user profiles detected
   - Shortcuts added for each user:
     - `work@company.com` → shortcut: `w`
     - `personal@gmail.com` → shortcut: `p`
     - `other@example.com` → shortcut: `o`
   - `work@company.com` selected as default

2. **For work commit (default user):**

   ```bash
   git-ai commit
   # Uses work@company.com
   ```

3. **For personal project (using shortcut):**

   ```bash
   git-ai commit --user p
   # or
   git-ai commit -u p
   # Uses personal@gmail.com
   ```

4. **For other project (using shortcut):**
   ```bash
   git-ai commit --user o
   # Uses other@example.com
   ```

## Configuration

Configuration file: `~/.git-ai/config.json`

```json
{
  "openaiKey": "sk-...",
  "gitUsers": [
    {
      "id": "global-user@example.com",
      "name": "John Doe",
      "email": "user@example.com",
      "scope": "global",
      "label": "John Doe <user@example.com> (Global)",
      "shortcut": "g"
    }
  ],
  "defaultGitUser": "global-user@example.com"
}
```

## Requirements

- Node.js >= 14.0.0
- OpenAI API key
- Git repository

## Security

- Your OpenAI API key is stored locally in `~/.git-ai/config.json`
- Commits are not automatically pushed
- Git user information is stored locally

## Troubleshooting

### Runtime Errors

#### "OpenAI API key not found" error

```bash
# If installed globally
git-ai setup

# Or with npx
npx @mehmetsagir/git-ai setup
```

#### "This directory is not a git repository" error

Make sure you're in a git repository:

```bash
git init  # If it doesn't exist
```

#### "No changes found to commit" error

Make sure you have changes:

```bash
git status
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
