# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`git-ai` is an AI-powered git commit tool. Users install it via npm, configure their OpenAI API key, then run `git-ai commit` in any git repository. The tool analyzes changes at the **hunk level**, groups related changes into logical commits, and creates them automatically. If a single file has multiple independent changes, they can be committed separately.

## Commands

```bash
git-ai setup    # Configure OpenAI API key
git-ai commit   # Analyze and create commits
git-ai reset    # Reset configuration
```

## Development

```bash
npm run build          # Compile TypeScript
node bin/git-ai [cmd]  # Test locally
```

## Architecture

```
src/
├── index.ts      # CLI entry point
├── setup.ts      # API key configuration
├── commit.ts     # Main commit workflow (hunk-based)
├── reset.ts      # Reset configuration
├── config.ts     # Config management (~/.git-ai/config.json)
├── git.ts        # Git operations (uses git apply for patches)
├── openai.ts     # OpenAI API integration
├── prompts.ts    # AI prompts for hunk grouping
├── types.ts      # TypeScript interfaces (HunkRef, CommitGroup)
└── utils/
    ├── errors.ts     # Error handling
    └── hunk-parser.ts # Parse git diff into hunks (read-only)
```

## Commit Flow (Hunk-Based)

1. Get full diff from `git diff` (staged + unstaged)
2. Parse diff into individual hunks per file (`hunk-parser.ts`)
3. Format hunks for AI analysis
4. Send to OpenAI → group hunks into commits
5. Show commit plan (which hunks from which files)
6. Get user approval
7. For each group:
   - Reset staging area
   - For modified files: Create patch with selected hunks, apply with `git apply --cached`
   - For new/deleted/binary files: Stage entire file
   - `git commit -m "message"`
8. Done

**IMPORTANT**: The tool NEVER manually modifies file contents. It uses `git apply --cached` to stage specific hunks safely.

## Key Types

```typescript
// Identifies a specific hunk
interface HunkRef {
  file: string;
  hunkIndex: number;
}

// A commit group contains hunks (not just files)
interface CommitGroup {
  number: number;
  description: string;
  hunks: HunkRef[];  // Which hunks to include
  commitMessage: string;
  commitBody?: string;
}
```

## Key Design Decisions

1. **Hunk-based grouping**: Multiple independent changes in one file can be committed separately
2. **Safe patching**: Uses `git apply --cached` instead of manual file manipulation
3. **Parse-only hunk parser**: `hunk-parser.ts` only parses, never modifies files
4. **Binary file support**: Images, fonts, etc. are staged as whole files
5. **New/deleted files**: Always staged as complete files

## Dependencies

- `openai`: GPT-4o-mini for analysis
- `simple-git`: Git operations
- `commander`: CLI
- `inquirer`: Prompts
- `chalk`: Colors
- `ora`: Spinners
