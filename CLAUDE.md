# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`git-ai` is an AI-powered git commit tool. Users install it via npm, configure their preferred AI provider (OpenAI, Google Gemini, or z.ai), then run `git-ai commit` in any git repository. The tool analyzes changes at the **hunk level**, groups related changes into logical commits, and creates them automatically. If a single file has multiple independent changes, they can be committed separately.

## Commands

```bash
git-ai setup    # Configure AI provider (OpenAI, Gemini, or z.ai) and API key
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
├── setup.ts      # AI provider and API key configuration
├── commit.ts     # Main commit workflow (hunk-based)
├── reset.ts      # Reset configuration
├── config.ts     # Config management (~/.git-ai/config.json)
├── git.ts        # Git operations (uses git apply for patches)
├── openai.ts     # [DEPRECATED] Legacy OpenAI module (use providers/)
├── prompts.ts    # AI prompts for hunk grouping
├── types.ts      # TypeScript interfaces (HunkRef, CommitGroup, AIProvider)
├── providers/    # AI provider abstraction layer
│   ├── types.ts     # IAIProvider interface
│   ├── openai.ts    # OpenAI provider (GPT-4o-mini)
│   ├── gemini.ts    # Google Gemini provider (Gemini Pro)
│   ├── zai.ts       # z.ai provider (GPT-4o-mini via z.ai)
│   └── index.ts     # Provider factory
└── utils/
    ├── errors.ts     # Error handling
    └── hunk-parser.ts # Parse git diff into hunks (read-only)
```

## Commit Flow (Hunk-Based)

1. Get full diff from `git diff` (staged + unstaged)
2. Parse diff into individual hunks per file (`hunk-parser.ts`)
3. Format hunks for AI analysis
4. Send to configured AI provider (OpenAI, Gemini, or z.ai) → group hunks into commits
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

1. **Multi-provider support**: Users can choose between OpenAI, Google Gemini, or z.ai
2. **Provider abstraction**: Common `IAIProvider` interface allows easy addition of new AI providers
3. **Hunk-based grouping**: Multiple independent changes in one file can be committed separately
4. **Safe patching**: Uses `git apply --cached` instead of manual file manipulation
5. **Parse-only hunk parser**: `hunk-parser.ts` only parses, never modifies files
6. **Binary file support**: Images, fonts, etc. are staged as whole files
7. **New/deleted files**: Always staged as complete files
8. **Backward compatibility**: Old configs with only `openaiKey` automatically use OpenAI provider

## Dependencies

- `openai`: OpenAI API integration (GPT-4o-mini) - also used for z.ai
- `@google/generative-ai`: Google Gemini API integration (Gemini Pro)
- `simple-git`: Git operations
- `commander`: CLI
- `inquirer`: Prompts
- `chalk`: Colors
- `ora`: Spinners

## AI Providers

### OpenAI
- Model: `gpt-4o-mini`
- API Key format: Starts with `sk-`
- Get API key: https://platform.openai.com/api-keys
- Configuration: Select during `git-ai setup`

### Google Gemini
- Model: `gemini-3-flash-preview`
- API Key format: Typically starts with `AI` (less strict validation)
- Get API key: https://makersuite.google.com/app/apikey
- Configuration: Select during `git-ai setup`

### z.ai
- Model: `GLM-4.7`
- API Endpoint: `https://api.z.ai/api/paas/v4`
- Get API key: https://z.ai/
- Documentation: https://docs.z.ai/
- Configuration: Select during `git-ai setup`
- Note: OpenAI-compatible API format with GLM models

All providers use the same prompts and produce identical commit group structures via JSON response format.
