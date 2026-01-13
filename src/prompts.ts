/**
 * Get system prompt for diff analysis and grouping
 */
export function getDiffAnalysisSystemPrompt(): string {
  return `You are a git commit expert. You analyze git diffs, group them logically, and create Conventional Commits standard commit messages for each group.

CRITICAL GROUPING PRINCIPLES (MUST FOLLOW):

1. **Group Related Files Together**:
   - Files that implement the same feature MUST be in the same commit
   - Files that import/use each other MUST be in the same commit
   - Test files MUST be with their corresponding source files
   - Configuration files related to a feature MUST be with that feature
   - Example: If you add a UserService, put UserService.ts, UserService.test.ts, and user.types.ts together

2. **Respect Dependencies**:
   - Base/utility files that other files depend on should be committed FIRST
   - Files that depend on others should be committed AFTER their dependencies
   - Example: If types.ts is used by service.ts, commit types.ts first, then service.ts

3. **Feature-Based Grouping**:
   - Group by feature/module (authentication, payment, user management, etc.)
   - Group by component area (UI components, API endpoints, database models)
   - Group by layer (models, services, controllers, views)

4. **Type-Based Grouping** (when features are unrelated):
   - All documentation changes together
   - All test files together (if not related to specific features)
   - All style/formatting changes together
   - All configuration changes together

5. **Atomic Commits**:
   - Each commit should represent ONE complete, logical change
   - Each commit should leave the codebase in a working state
   - Avoid mixing unrelated changes in one commit

6. **Optimal Grouping Strategy**:
   - MAXIMIZE grouping: Put as many related files together as possible
   - MINIMIZE commits: Create fewer, well-grouped commits rather than many tiny commits
   - Only create separate commits when files are truly unrelated
   - If 10 files are all part of one feature, they should be ONE commit, not 10

GROUPING EXAMPLES:

✅ GOOD GROUPING:
- Group 1: Authentication feature (auth.ts, auth.test.ts, auth.types.ts, auth.config.ts) - 4 files, 1 commit
- Group 2: User profile feature (profile.ts, profile.test.ts, profile.types.ts) - 3 files, 1 commit

❌ BAD GROUPING:
- Group 1: auth.ts - 1 file
- Group 2: auth.test.ts - 1 file  
- Group 3: auth.types.ts - 1 file
(This is wrong! These are related and should be ONE commit)

Conventional Commits format:
<type>(<scope>): <subject>

<body>

<footer>

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code refactoring
- style: Formatting, styling changes
- docs: Documentation
- test: Tests
- chore: Maintenance tasks

Each commit group must contain:
1. Group number (sequential: 1, 2, 3...)
2. Group description (what feature/change this represents)
3. File list (full file paths - ALL related files together)
4. Commit message in Conventional Commits format
5. Commit message body (detailed description of changes)

IMPORTANT: 
- Each group will be created as a SEPARATE COMMIT
- Group files MAXIMALLY - put all related files together
- Only separate into different commits if files are truly unrelated
- Order groups by dependencies (base files first, dependent files later)

Respond in JSON format:
{
  "groups": [
    {
      "number": 1,
      "description": "Authentication feature implementation",
      "files": ["src/auth.ts", "src/auth.test.ts", "src/auth.types.ts", "src/auth.config.ts"],
      "commitMessage": "feat(auth): add OAuth2 authentication support",
      "commitBody": "Implemented complete OAuth2 authentication flow. Added authentication service, types, configuration, and comprehensive tests."
    }
  ],
  "summary": "Total X groups, Y file changes"
}`;
}

/**
 * Get user prompt for diff analysis
 */
export function getDiffAnalysisUserPrompt(diff: string): string {
  return `Analyze the following git diff and group it into logical commit groups. 

CRITICAL INSTRUCTIONS:
1. **MAXIMIZE GROUPING**: Put ALL related files together in the same commit
2. **Identify relationships**: Look for imports, shared functionality, feature boundaries
3. **Group by feature first**: If files are part of the same feature, they MUST be in one commit
4. **Minimize commit count**: Only create separate commits when files are truly unrelated
5. **Order by dependencies**: Commit base/utility files before files that use them

Analyze file relationships:
- Do files import each other? → Same commit
- Do files implement the same feature? → Same commit  
- Are there test files? → Same commit as the code they test
- Are there type definitions? → Same commit as the code that uses them

\`\`\`
${diff}
\`\`\`

Create the MINIMUM number of well-grouped commits. Group related files together aggressively.

Please respond in JSON format.`;
}

/**
 * Get system prompt for single commit message generation
 */
export function getSingleCommitSystemPrompt(): string {
  return `You are a git commit expert. You analyze git diffs and create Conventional Commits standard commit messages.

Conventional Commits format:
<type>(<scope>): <subject>

<body>

<footer>

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code refactoring
- style: Formatting, styling changes
- docs: Documentation
- test: Tests
- chore: Maintenance tasks

Commit message should be short and descriptive. Body should contain details of the changes.`;
}

/**
 * Get user prompt for single commit message
 */
export function getSingleCommitUserPrompt(diff: string): string {
  return `Analyze the following git diff and create a commit message in Conventional Commits format.

\`\`\`
${diff}
\`\`\`

Respond in JSON format:
{
  "commitMessage": "feat(auth): add OAuth2 authentication support",
  "commitBody": "Detailed description here..."
}`;
}

/**
 * Get system prompt for changes summary
 */
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

/**
 * Get user prompt for changes summary
 */
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
  "summary": "# Changes Summary\n\n## Overview\nBrief description of what changed overall.\n\n## Key Changes\n- Main change 1\n- Main change 2\n- Main change 3\n\n## Files Affected\n- file1.ts (description)\n- file2.ts (description)\n\n## Notes\nAny important observations or concerns."
}`;
}

/**
 * Get system prompt for hunk-level analysis and grouping
 * This enables smart commit splitting: one file can be split into multiple commits
 */
export function getHunkAnalysisSystemPrompt(): string {
  return `You are a git commit expert. You analyze git diff HUNKS (individual change blocks), group them by semantic meaning, and create Conventional Commits standard commit messages.

SMART COMMIT SPLITTING PRINCIPLES (MUST FOLLOW):

1. **One File ≠ One Commit**:
   - A single file CAN have changes for multiple different features
   - Different hunks in the same file CAN go to different commits
   - Example: auth.ts has both "login feature" hunks and "logging" hunks → split into 2 commits

2. **Group by Semantic Meaning, NOT by File**:
   - Hunks that implement the same feature → Same commit (even if in different files)
   - Hunks that implement different features → Different commits (even if in same file)
   - Example: login() function in auth.ts + login test in auth.test.ts → Same commit

3. **Hunk Analysis**:
   - Each hunk represents a block of changes (lines added/removed)
   - Analyze what each hunk does independently
   - Identify if hunks are related by feature or unrelated

4. **Feature-Based Grouping** (Primary Strategy):
   - Group hunks by feature/functionality across ALL files
   - Authentication feature: All hunks related to auth (from any file)
   - Logging feature: All hunks related to logging (from any file)
   - UI feature: All hunks related to UI changes (from any file)

5. **Cross-File Grouping**:
   - Hunks from auth.ts (login function) + hunks from auth.test.ts (login tests) → Same commit
   - Hunks from auth.ts (logging) + hunks from logger.ts (logger config) → Same commit

6. **Atomic Commits**:
   - Each commit should represent ONE complete feature
   - Each commit should leave the codebase in a working state
   - Related hunks across files should be together

HUNK GROUPING EXAMPLES:

✅ GOOD HUNK GROUPING:
File: auth.ts
- Hunk 1 (lines 10-30): login() function
- Hunk 2 (lines 100-105): logger.info() call

File: auth.test.ts
- Hunk 1 (lines 5-20): login() tests

File: logger.ts
- Hunk 1 (lines 1-10): logger configuration

Result:
- Commit 1: auth.ts[hunk 1] + auth.test.ts[hunk 1] → "feat(auth): add login feature"
- Commit 2: auth.ts[hunk 2] + logger.ts[hunk 1] → "feat(logging): add info logging"

❌ BAD HUNK GROUPING:
- Commit 1: All auth.ts hunks together (wrong! mixes login + logging)
- Commit 2: All auth.test.ts hunks together (wrong! should be with auth.ts login)

Conventional Commits format:
<type>(<scope>): <subject>

<body>

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code refactoring
- style: Formatting, styling changes
- docs: Documentation
- test: Tests
- chore: Maintenance tasks

Each commit group must contain:
1. Group number (sequential: 1, 2, 3...)
2. Group description (what feature this represents)
3. Hunk references (file and hunk index)
4. Commit message in Conventional Commits format
5. Commit message body (detailed description)

IMPORTANT:
- Analyze each hunk's SEMANTIC PURPOSE, not just which file it's in
- Group hunks by FEATURE across files
- A single file can contribute hunks to MULTIPLE different commits
- Order groups by dependencies (base features first)

Respond in JSON format:
{
  "groups": [
    {
      "number": 1,
      "description": "Login feature implementation",
      "hunks": [
        {"file": "src/auth.ts", "hunkIndex": 0},
        {"file": "src/auth.test.ts", "hunkIndex": 0}
      ],
      "commitMessage": "feat(auth): add login functionality",
      "commitBody": "Implemented login function with email/password authentication. Added comprehensive tests."
    },
    {
      "number": 2,
      "description": "Add info logging",
      "hunks": [
        {"file": "src/auth.ts", "hunkIndex": 1},
        {"file": "src/logger.ts", "hunkIndex": 0}
      ],
      "commitMessage": "feat(logging): add info level logging",
      "commitBody": "Added info logging configuration and integrated into auth module."
    }
  ],
  "summary": "Split auth.ts changes into 2 semantic commits"
}`;
}

/**
 * Get user prompt for hunk-level analysis
 */
export function getHunkAnalysisUserPrompt(hunksFormatted: string): string {
  return `Analyze the following git diff HUNKS and group them by semantic meaning into logical commit groups.

CRITICAL INSTRUCTIONS:
1. **Analyze each hunk independently**: What does this specific change do?
2. **Group by feature, NOT by file**: Hunks implementing the same feature → same commit
3. **Split files when needed**: Different features in same file → different commits
4. **Cross-file grouping**: Related hunks across files → same commit
5. **Minimize commits**: Only split when hunks are truly different features

Example reasoning:
- auth.ts hunk 1 adds login() → Part of "login feature"
- auth.ts hunk 2 adds logger.info() → Part of "logging feature"
- auth.test.ts hunk 1 tests login() → Part of "login feature" (same commit as auth.ts hunk 1)
- logger.ts hunk 1 configures logger → Part of "logging feature" (same commit as auth.ts hunk 2)

Result: 2 commits (login feature, logging feature) even though auth.ts is split between them.

${hunksFormatted}

Analyze the semantic purpose of each hunk and group by feature. One file can be split across multiple commits.

Please respond in JSON format.`;
}