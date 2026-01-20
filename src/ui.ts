import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import * as git from "./git";
import * as openai from "./openai";
import { getOpenAIKey } from "./config";
import { parseDiff, formatForAI, getStats, FileDiff } from "./utils/hunk-parser";

// SSE clients for real-time updates
const sseClients: Set<http.ServerResponse> = new Set();

// File watcher with debounce
let fileWatcher: fs.FSWatcher | null = null;
let watchDebounceTimer: NodeJS.Timeout | null = null;

function notifyClients(): void {
  // Debounce notifications
  if (watchDebounceTimer) clearTimeout(watchDebounceTimer);
  watchDebounceTimer = setTimeout(() => {
    sseClients.forEach((client) => {
      try {
        client.write(`data: refresh\n\n`);
      } catch {
        sseClients.delete(client);
      }
    });
  }, 300);
}

function startFileWatcher(): void {
  const cwd = process.cwd();
  try {
    fileWatcher = fs.watch(cwd, { recursive: true }, (_eventType, filename) => {
      // Ignore .git directory and node_modules
      if (filename && (filename.startsWith(".git") || filename.includes("node_modules"))) {
        return;
      }
      notifyClients();
    });
  } catch {
    // Fallback: no file watching
    console.log(chalk.yellow("File watching not available"));
  }
}

function stopFileWatcher(): void {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  if (watchDebounceTimer) {
    clearTimeout(watchDebounceTimer);
    watchDebounceTimer = null;
  }
}

const PORT = 3848;

async function getFileDiff(file: string, status?: string, staged?: boolean): Promise<string> {
  try {
    // For NEW files, always read file content directly to ensure full content
    if (status === "new") {
      const filePath = path.resolve(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        // Remove trailing empty line if exists
        if (lines.length > 0 && lines[lines.length - 1] === "") {
          lines.pop();
        }
        const diffLines = lines.map((line) => `+${line}`).join("\n");
        return `diff --git a/${file} b/${file}
new file mode 100644
--- /dev/null
+++ b/${file}
@@ -0,0 +1,${lines.length} @@
${diffLines}`;
      }
    }

    // For modified/deleted files, get diff from git
    let fullDiff: string;
    if (staged === true) {
      fullDiff = await git.getStagedDiff();
    } else if (staged === false) {
      fullDiff = await git.getUnstagedDiff();
    } else {
      fullDiff = await git.getFullDiff();
    }

    const parts = fullDiff.split(/(?=diff --git )/);

    // Look for exact match in diff header
    for (const part of parts) {
      // Check if this diff is for our file (exact match in header)
      const headerMatch = part.match(/^diff --git a\/(.+?) b\/(.+?)[\r\n]/);
      if (headerMatch && (headerMatch[1] === file || headerMatch[2] === file)) {
        return part;
      }
    }

    return "";
  } catch {
    return "";
  }
}

function getHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>git-ai - Commit Manager</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1e1e;
      color: #cccccc;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .app-header {
      padding: 12px 20px;
      background: #252526;
      border-bottom: 1px solid #3c3c3c;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .app-title {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .app-title span {
      color: #4ec9b0;
      font-family: 'SF Mono', Monaco, monospace;
    }
    .header-actions {
      display: flex;
      gap: 8px;
    }
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s, opacity 0.15s;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-primary {
      background: #0e639c;
      color: #fff;
    }
    .btn-primary:hover:not(:disabled) {
      background: #1177bb;
    }
    .btn-success {
      background: #238636;
      color: #fff;
    }
    .btn-success:hover:not(:disabled) {
      background: #2ea043;
    }
    .btn-secondary {
      background: #3c3c3c;
      color: #fff;
    }
    .btn-secondary:hover:not(:disabled) {
      background: #4c4c4c;
    }
    .btn svg {
      width: 14px;
      height: 14px;
      pointer-events: none;
    }
    .btn * {
      pointer-events: none;
    }

    /* Main Container */
    .container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* Sidebar - File List */
    .sidebar {
      width: 320px;
      background: #252526;
      border-right: 1px solid #3c3c3c;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .sidebar-header {
      padding: 12px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sidebar-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #bbbbbb;
    }
    .file-count {
      font-size: 11px;
      color: #6e7681;
    }
    .file-sections {
      flex: 1;
      overflow-y: auto;
    }
    .file-section {
      border-bottom: 1px solid #3c3c3c;
    }
    .section-header {
      padding: 8px 12px;
      background: #2d2d2d;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      user-select: none;
    }
    .section-header:hover {
      background: #333333;
    }
    .section-chevron {
      width: 16px;
      height: 16px;
      transition: transform 0.15s;
      flex-shrink: 0;
    }
    .section-chevron.collapsed {
      transform: rotate(-90deg);
    }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #bbbbbb;
      flex: 1;
    }
    .section-count {
      font-size: 11px;
      color: #6e7681;
      background: #3c3c3c;
      padding: 2px 6px;
      border-radius: 10px;
      min-width: 20px;
      text-align: center;
    }
    .section-action {
      width: 20px;
      height: 20px;
      padding: 2px;
      background: none;
      border: none;
      color: #8b949e;
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .section-action:hover {
      background: #3c3c3c;
      color: #e1e1e1;
    }
    .section-action svg {
      width: 14px;
      height: 14px;
    }
    .file-list {
      overflow-y: auto;
    }
    .file-list.collapsed {
      display: none;
    }
    .file-item {
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      border-bottom: 1px solid #2d2d2d;
      transition: background 0.1s;
    }
    .file-item:hover {
      background: #2a2d2e;
    }
    .file-item.selected {
      background: #094771;
    }
    .custom-checkbox {
      width: 18px;
      height: 18px;
      border: 2px solid #6e7681;
      border-radius: 3px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.05);
    }
    .custom-checkbox:hover {
      border-color: #58a6ff;
      background: rgba(88, 166, 255, 0.1);
    }
    .custom-checkbox.checked {
      background: #0e639c;
      border-color: #0e639c;
    }
    .file-item.selected .custom-checkbox {
      border-color: #8b949e;
    }
    .file-item.selected .custom-checkbox.checked {
      border-color: #0e639c;
    }
    .stage-btn {
      width: 22px;
      height: 22px;
      padding: 3px;
      background: none;
      border: none;
      color: #6e7681;
      cursor: pointer;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.15s, background 0.15s;
    }
    .file-item:hover .stage-btn {
      opacity: 1;
    }
    .stage-btn:hover {
      background: #3c3c3c;
      color: #e1e1e1;
    }
    .stage-btn svg {
      width: 14px;
      height: 14px;
    }
    .custom-checkbox svg {
      width: 12px;
      height: 12px;
      color: #fff;
      opacity: 0;
      transform: scale(0.5);
      transition: all 0.15s;
    }
    .custom-checkbox.checked svg {
      opacity: 1;
      transform: scale(1);
    }
    .file-info {
      flex: 1;
      min-width: 0;
    }
    .file-name {
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-path {
      font-size: 11px;
      color: #6e7681;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-status {
      width: 18px;
      height: 18px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .file-status.new { background: #238636; color: #fff; }
    .file-status.modified { background: #9e6a03; color: #fff; }
    .file-status.deleted { background: #da3633; color: #fff; }
    .file-status.renamed { background: #8957e5; color: #fff; }

    .select-actions {
      padding: 8px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
      display: flex;
      gap: 8px;
    }
    .select-actions button {
      padding: 4px 8px;
      font-size: 11px;
      background: none;
      border: 1px solid #3c3c3c;
      color: #bbbbbb;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .select-actions button:hover {
      background: #3c3c3c;
    }

    /* Main Panel */
    .main-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* Diff Viewer */
    .diff-panel {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .diff-header {
      padding: 10px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .diff-filename {
      font-size: 13px;
      font-family: 'SF Mono', Monaco, monospace;
      color: #dcdcaa;
    }
    .diff-view-toggle {
      display: flex;
      background: #1e1e1e;
      border-radius: 4px;
      overflow: hidden;
    }
    .diff-view-toggle button {
      padding: 4px 10px;
      border: none;
      background: none;
      color: #8b949e;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s;
    }
    .diff-view-toggle button:hover {
      color: #e1e1e1;
    }
    .diff-view-toggle button.active {
      background: #0e639c;
      color: #fff;
    }
    .diff-view-toggle button svg {
      width: 14px;
      height: 14px;
    }
    .diff-content {
      flex: 1;
      overflow: auto;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 13px;
      line-height: 20px;
      display: flex;
      flex-direction: column;
    }
    /* Unified diff view */
    .diff-unified .diff-line {
      padding: 0 16px;
      white-space: pre;
      min-height: 20px;
    }
    .diff-unified .diff-line.add { background: #2ea04326; color: #3fb950; }
    .diff-unified .diff-line.del { background: #f8514926; color: #f85149; }
    .diff-unified .diff-line.hunk { background: #388bfd26; color: #58a6ff; }
    .diff-unified .diff-line.header { color: #6e7681; }
    .diff-unified .line-num {
      display: inline-block;
      width: 40px;
      color: #6e7681;
      text-align: right;
      margin-right: 16px;
      user-select: none;
    }
    /* Split diff view */
    .diff-split {
      display: flex;
      height: 100%;
    }
    .diff-split-pane {
      flex: 1;
      overflow: auto;
      border-right: 1px solid #3c3c3c;
    }
    .diff-split-pane:last-child {
      border-right: none;
    }
    .diff-split-pane-header {
      padding: 8px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
      font-size: 11px;
      color: #8b949e;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .diff-split-pane-content {
      min-height: 100%;
    }
    .diff-split .diff-line {
      padding: 0 16px;
      white-space: pre;
      min-height: 20px;
    }
    .diff-split .diff-line.add { background: #2ea04326; color: #3fb950; }
    .diff-split .diff-line.del { background: #f8514926; color: #f85149; }
    .diff-split .diff-line.empty { background: #2d2d2d; }
    .diff-split .diff-line.hunk { background: #388bfd26; color: #58a6ff; }
    .diff-split .line-num {
      display: inline-block;
      width: 40px;
      color: #6e7681;
      text-align: right;
      margin-right: 16px;
      user-select: none;
    }
    /* Legacy support */
    .diff-line {
      padding: 0 16px;
      white-space: pre;
      min-height: 20px;
    }
    .diff-line.add { background: #2ea04326; color: #3fb950; }
    .diff-line.del { background: #f8514926; color: #f85149; }
    .diff-line.hunk { background: #388bfd26; color: #58a6ff; }
    .diff-line.header { color: #6e7681; }
    .line-num {
      display: inline-block;
      width: 40px;
      color: #6e7681;
      text-align: right;
      margin-right: 16px;
      user-select: none;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #6e7681;
      gap: 12px;
      min-height: 100%;
    }
    .empty-state svg {
      width: 48px;
      height: 48px;
      opacity: 0.5;
    }

    /* Commit Plan View (in main panel) */
    .commit-plan-view {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .commit-plan-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid #3c3c3c;
    }
    .commit-plan-title {
      font-size: 14px;
      font-weight: 600;
      color: #e1e1e1;
    }
    .commit-plan-actions {
      display: flex;
      gap: 8px;
    }
    .commit-group {
      background: #252526;
      border: 1px solid #3c3c3c;
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .commit-group:last-child {
      margin-bottom: 0;
    }
    .group-header {
      padding: 12px 16px;
      background: #2d2d2d;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #3c3c3c;
      cursor: pointer;
      user-select: none;
    }
    .group-header:hover {
      background: #333333;
    }
    .group-chevron {
      width: 16px;
      height: 16px;
      color: #8b949e;
      transition: transform 0.15s;
      flex-shrink: 0;
    }
    .group-chevron.collapsed {
      transform: rotate(-90deg);
    }
    .group-content {
      display: block;
    }
    .group-content.collapsed {
      display: none;
    }
    .group-number {
      width: 28px;
      height: 28px;
      background: #0e639c;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .group-message {
      font-size: 14px;
      color: #4ec9b0;
      font-family: 'SF Mono', Monaco, monospace;
    }
    .group-file-section {
      border-bottom: 1px solid #3c3c3c;
    }
    .group-file-section:last-child {
      border-bottom: none;
    }
    .group-file-header {
      padding: 10px 16px;
      background: #1e1e1e;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #dcdcaa;
      font-family: 'SF Mono', Monaco, monospace;
      cursor: pointer;
      user-select: none;
    }
    .group-file-header:hover {
      background: #252526;
    }
    .group-file-chevron {
      width: 14px;
      height: 14px;
      color: #6e7681;
      transition: transform 0.15s;
      flex-shrink: 0;
    }
    .group-file-chevron.collapsed {
      transform: rotate(-90deg);
    }
    .group-file-icon {
      width: 14px;
      height: 14px;
      color: #6e7681;
    }
    .group-file-diff {
      background: #1e1e1e;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      line-height: 18px;
    }
    .group-file-diff.collapsed {
      display: none;
    }
    .group-file-diff .diff-line {
      padding: 0 16px;
      white-space: pre;
    }
    .group-file-diff .diff-line.add { background: #2ea04326; color: #3fb950; }
    .group-file-diff .diff-line.del { background: #f8514926; color: #f85149; }
    .group-file-diff .diff-line-num {
      display: inline-block;
      width: 35px;
      color: #6e7681;
      text-align: right;
      margin-right: 12px;
      user-select: none;
    }

    /* Toast */
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 13px;
      color: #fff;
      opacity: 0;
      transform: translateY(-10px);
      transition: opacity 0.2s, transform 0.2s;
      z-index: 1000;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .toast.success { background: #238636; }
    .toast.error { background: #da3633; }

    /* Loader */
    .loader-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 999;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s, visibility 0.2s;
    }
    .loader-overlay.show {
      opacity: 1;
      visibility: visible;
    }
    .loader {
      width: 40px;
      height: 40px;
      border: 3px solid #3c3c3c;
      border-top-color: #58a6ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    .loader-text {
      color: #e1e1e1;
      font-size: 13px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Footer */
    .sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid #3c3c3c;
      background: #1e1e1e;
      text-align: center;
    }
    .sidebar-footer-brand {
      font-size: 12px;
      font-weight: 600;
      color: #e1e1e1;
      margin-bottom: 4px;
      font-family: 'SF Mono', Monaco, monospace;
    }
    .sidebar-footer a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #6e7681;
      text-decoration: none;
      font-size: 11px;
      transition: color 0.15s;
    }
    .sidebar-footer a:hover {
      color: #58a6ff;
    }
    .sidebar-footer a svg {
      width: 14px;
      height: 14px;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: #1e1e1e; }
    ::-webkit-scrollbar-thumb { background: #424242; border-radius: 5px; }
    ::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }
  </style>
</head>
<body>
  <header class="app-header">
    <div class="app-title">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
      </svg>
      <span>git-ai</span> Commit Manager
    </div>
    <div class="header-actions">
      <button class="btn btn-success" onclick="showCommitPanel()" id="commitPlanBtn" style="display: none;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
          <path d="M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          <path d="M9 12h6M9 16h6"/>
        </svg>
        Commit Plan
      </button>
      <button class="btn btn-secondary" onclick="refreshFiles()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        Refresh
      </button>
      <button class="btn btn-primary" onclick="analyzeSelected()" id="analyzeBtn" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a10 10 0 1 0 10 10H12V2z"/>
          <path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
        Analyze with AI
      </button>
    </div>
  </header>

  <div class="container">
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="sidebar-title">Source Control</span>
        <span class="file-count" id="fileCount">0 files</span>
      </div>
      <div class="select-actions">
        <button onclick="selectAll()">Select All</button>
        <button onclick="selectNone()">Select None</button>
      </div>
      <div class="file-sections">
        <!-- Staged Changes Section -->
        <div class="file-section" id="stagedSection" style="display: none;">
          <div class="section-header" onclick="toggleSection('staged')">
            <svg class="section-chevron" id="stagedChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="section-title">Staged Changes</span>
            <span class="section-count" id="stagedCount">0</span>
            <button class="section-action" onclick="event.stopPropagation(); unstageAllFiles()" title="Unstage All">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
            </button>
          </div>
          <div class="file-list" id="stagedList"></div>
        </div>
        <!-- Unstaged Changes Section -->
        <div class="file-section" id="unstagedSection">
          <div class="section-header" onclick="toggleSection('unstaged')">
            <svg class="section-chevron" id="unstagedChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
            <span class="section-title">Changes</span>
            <span class="section-count" id="unstagedCount">0</span>
            <button class="section-action" onclick="event.stopPropagation(); stageAllFiles()" title="Stage All">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <div class="file-list" id="unstagedList">
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M5 13l4 4L19 7"/>
              </svg>
              <div>Working tree clean</div>
            </div>
          </div>
        </div>
      </div>
      <div class="sidebar-footer">
        <div class="sidebar-footer-brand">git-ai</div>
        <a href="https://github.com/mehmetsagir/git-ai" target="_blank">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Open source on GitHub
        </a>
      </div>
    </aside>

    <main class="main-panel">
      <div class="diff-panel">
        <div class="diff-header" id="diffHeader">
          <span class="diff-filename" id="diffFilename">Select a file to view changes</span>
          <div class="diff-view-toggle" id="diffViewToggle" style="display: none;">
            <button class="active" onclick="setDiffView('unified')" id="btnUnified">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
              Unified
            </button>
            <button onclick="setDiffView('split')" id="btnSplit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="18" rx="1"/>
                <rect x="14" y="3" width="7" height="18" rx="1"/>
              </svg>
              Split
            </button>
          </div>
        </div>
        <div class="diff-content" id="diffContent">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <div>Select a file to view diff</div>
          </div>
        </div>
      </div>
    </main>

  </div>

  <div class="toast" id="toast"></div>
  <div class="loader-overlay" id="loader">
    <div class="loader"></div>
    <div class="loader-text" id="loaderText">Loading...</div>
  </div>

  <script>
    let files = [];
    let selectedFiles = new Set();
    let currentFile = null;
    let currentFileStaged = null;
    let currentDiff = null;
    let diffViewMode = 'unified';
    let commitGroups = null;
    let isLoading = false;
    let eventSource = null;
    let viewingCommitPlan = false;

    // Initialize
    init();

    function init() {
      // Set up event delegation once
      // Event delegation for both staged and unstaged lists
      const fileSections = document.querySelector('.file-sections');
      fileSections.addEventListener('click', function(e) {
        const item = e.target.closest('.file-item');
        if (!item) return;

        const file = item.dataset.file;
        const staged = item.dataset.staged === 'true';
        const isCheckbox = e.target.closest('[data-checkbox]');
        const isStageBtn = e.target.closest('[data-stage-action]');

        if (isStageBtn) {
          const action = isStageBtn.dataset.stageAction;
          if (action === 'stage') {
            stageFile(file);
          } else {
            unstageFile(file);
          }
        } else if (isCheckbox) {
          toggleFile(file, staged);
        } else {
          viewFile(file, staged);
        }
      });

      // Initial load
      refreshFiles();

      // Connect to SSE for real-time updates
      connectSSE();
    }

    function connectSSE() {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/api/events');

      eventSource.onmessage = function(event) {
        if (event.data === 'refresh') {
          handleFileChange();
        }
      };

      eventSource.onerror = function() {
        // Reconnect after 3 seconds
        setTimeout(connectSSE, 3000);
      };
    }

    async function handleFileChange() {
      if (isLoading) return;
      try {
        const res = await fetch('/api/files?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const newFiles = await res.json();

        // Check if files changed (include staged status)
        const oldFileSet = new Set(files.map(f => f.file + ':' + f.status + ':' + f.staged));
        const newFileSet = new Set(newFiles.map(f => f.file + ':' + f.status + ':' + f.staged));

        const hasFileListChanges = oldFileSet.size !== newFileSet.size ||
          [...oldFileSet].some(f => !newFileSet.has(f)) ||
          [...newFileSet].some(f => !oldFileSet.has(f));

        if (hasFileListChanges) {
          files = newFiles;
          // Clean up selectedFiles - remove files that no longer exist
          const existingFiles = new Set(files.map(f => f.file));
          selectedFiles = new Set([...selectedFiles].filter(f => existingFiles.has(f)));

          renderFileList();
          updateAnalyzeButton();

          // Update diff if current file no longer exists with same staged status
          const currentFileExists = files.some(f => f.file === currentFile && f.staged === currentFileStaged);
          if (currentFile && !currentFileExists) {
            currentFile = null;
            currentFileStaged = null;
            currentDiff = null;
            document.getElementById('diffFilename').textContent = 'Select a file to view changes';
            document.getElementById('diffViewToggle').style.display = 'none';
            document.getElementById('diffContent').innerHTML = \`
              <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <div>Select a file to view diff</div>
              </div>
            \`;
            return;
          }
        } else {
          files = newFiles;
        }

        // Refresh current file's diff
        if (currentFile) {
          const fileInfo = files.find(f => f.file === currentFile && f.staged === currentFileStaged);
          if (fileInfo) {
            const diffRes = await fetch('/api/diff?file=' + encodeURIComponent(currentFile) + '&status=' + encodeURIComponent(fileInfo.status) + '&staged=' + currentFileStaged + '&t=' + Date.now(), { cache: 'no-store' });
            if (diffRes.ok) {
              const newDiff = await diffRes.text();
              if (newDiff !== currentDiff) {
                currentDiff = newDiff;
                document.getElementById('diffViewToggle').style.display = currentDiff ? 'flex' : 'none';
                renderDiff(currentDiff);
              }
            }
          }
        }
      } catch (err) {
        // Silently ignore errors
      }
    }

    async function refreshFiles() {
      showLoader('Loading changes...');
      try {
        const res = await fetch('/api/files?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('HTTP ' + res.status);
        }
        files = await res.json();
        renderFileList();
        updateAnalyzeButton();
        if (files.length === 0) {
          document.getElementById('diffFilename').textContent = 'No changes detected';
          document.getElementById('diffViewToggle').style.display = 'none';
          document.getElementById('diffContent').innerHTML = \`
            <div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M5 13l4 4L19 7"/>
              </svg>
              <div>Working tree clean</div>
            </div>
          \`;
        }
      } catch (err) {
        console.error('Failed to load files:', err);
        showToast('Failed to load files: ' + err.message, 'error');
      }
      hideLoader();
    }

    function renderFileList() {
      const stagedFiles = files.filter(f => f.staged);
      const unstagedFiles = files.filter(f => !f.staged);
      const totalFiles = new Set(files.map(f => f.file)).size;

      document.getElementById('fileCount').textContent = totalFiles + ' file' + (totalFiles !== 1 ? 's' : '');

      // Staged section
      const stagedSection = document.getElementById('stagedSection');
      const stagedList = document.getElementById('stagedList');
      const stagedCount = document.getElementById('stagedCount');

      if (stagedFiles.length > 0) {
        stagedSection.style.display = 'block';
        stagedCount.textContent = stagedFiles.length;
        stagedList.innerHTML = stagedFiles.map(f => renderFileItem(f, true)).join('');
      } else {
        stagedSection.style.display = 'none';
      }

      // Unstaged section
      const unstagedList = document.getElementById('unstagedList');
      const unstagedCount = document.getElementById('unstagedCount');
      unstagedCount.textContent = unstagedFiles.length;

      if (unstagedFiles.length === 0 && stagedFiles.length === 0) {
        unstagedList.innerHTML = \`
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M5 13l4 4L19 7"/>
            </svg>
            <div>Working tree clean</div>
          </div>
        \`;
      } else if (unstagedFiles.length === 0) {
        unstagedList.innerHTML = \`
          <div class="empty-state" style="padding: 16px;">
            <div style="font-size: 12px;">No unstaged changes</div>
          </div>
        \`;
      } else {
        unstagedList.innerHTML = unstagedFiles.map(f => renderFileItem(f, false)).join('');
      }
    }

    function renderFileItem(f, isStaged) {
      const statusLabel = { new: 'A', modified: 'M', deleted: 'D', renamed: 'R' }[f.status] || 'M';
      const fileName = f.file.split('/').pop();
      const filePath = f.file.includes('/') ? f.file.substring(0, f.file.lastIndexOf('/')) : '';
      const fileKey = f.file + ':' + (isStaged ? 'staged' : 'unstaged');
      const isSelected = selectedFiles.has(fileKey);
      const isActive = currentFile === f.file && currentFileStaged === isStaged;
      const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
      const stageIcon = isStaged
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';

      return \`
        <div class="file-item \${isActive ? 'selected' : ''}" data-file="\${escapeHtml(f.file)}" data-status="\${f.status}" data-staged="\${isStaged}">
          <div class="custom-checkbox \${isSelected ? 'checked' : ''}" data-checkbox="true">\${checkIcon}</div>
          <div class="file-status \${f.status}">\${statusLabel}</div>
          <div class="file-info">
            <div class="file-name">\${escapeHtml(fileName)}</div>
            \${filePath ? \`<div class="file-path">\${escapeHtml(filePath)}</div>\` : ''}
          </div>
          <button class="stage-btn" data-stage-action="\${isStaged ? 'unstage' : 'stage'}" title="\${isStaged ? 'Unstage' : 'Stage'}">\${stageIcon}</button>
        </div>
      \`;
    }

    function toggleFile(file, staged) {
      const fileKey = file + ':' + (staged ? 'staged' : 'unstaged');
      if (selectedFiles.has(fileKey)) {
        selectedFiles.delete(fileKey);
      } else {
        selectedFiles.add(fileKey);
      }
      renderFileList();
      updateAnalyzeButton();
    }

    async function stageFile(file) {
      try {
        await fetch('/api/stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file })
        });
      } catch (err) {
        showToast('Failed to stage file', 'error');
      }
    }

    async function unstageFile(file) {
      try {
        await fetch('/api/unstage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file })
        });
      } catch (err) {
        showToast('Failed to unstage file', 'error');
      }
    }

    async function stageAllFiles() {
      const unstagedFiles = files.filter(f => !f.staged);
      for (const f of unstagedFiles) {
        await stageFile(f.file);
      }
    }

    async function unstageAllFiles() {
      const stagedFiles = files.filter(f => f.staged);
      for (const f of stagedFiles) {
        await unstageFile(f.file);
      }
    }

    function toggleSection(section) {
      const chevron = document.getElementById(section + 'Chevron');
      const list = document.getElementById(section + 'List');
      chevron.classList.toggle('collapsed');
      list.classList.toggle('collapsed');
    }

    function selectAll() {
      files.forEach(f => {
        const fileKey = f.file + ':' + (f.staged ? 'staged' : 'unstaged');
        selectedFiles.add(fileKey);
      });
      renderFileList();
      updateAnalyzeButton();
    }

    function selectNone() {
      selectedFiles.clear();
      renderFileList();
      updateAnalyzeButton();
    }

    function updateAnalyzeButton() {
      const btn = document.getElementById('analyzeBtn');
      btn.disabled = selectedFiles.size === 0;
      // Count unique files (not file:staged keys)
      const uniqueFiles = new Set([...selectedFiles].map(k => k.split(':')[0]));
      btn.textContent = selectedFiles.size > 0
        ? \`Analyze \${selectedFiles.size} file\${selectedFiles.size > 1 ? 's' : ''}\`
        : 'Analyze with AI';
    }

    async function viewFile(file, staged) {
      currentFile = file;
      currentFileStaged = staged;
      viewingCommitPlan = false;
      renderFileList();

      // Show commit plan button if we have a plan
      if (commitGroups && commitGroups.length > 0) {
        document.getElementById('commitPlanBtn').style.display = 'inline-flex';
      }

      const label = staged ? ' (staged)' : '';
      document.getElementById('diffFilename').textContent = file + label;
      document.getElementById('diffContent').innerHTML = '<div class="empty-state"><div class="loader"></div></div>';

      // Find file status
      const fileInfo = files.find(f => f.file === file && f.staged === staged);
      const status = fileInfo ? fileInfo.status : '';

      try {
        const res = await fetch('/api/diff?file=' + encodeURIComponent(file) + '&status=' + encodeURIComponent(status) + '&staged=' + staged + '&t=' + Date.now(), { cache: 'no-store' });
        currentDiff = await res.text();
        document.getElementById('diffViewToggle').style.display = currentDiff ? 'flex' : 'none';
        renderDiff(currentDiff);
      } catch (err) {
        document.getElementById('diffContent').innerHTML = '<div class="empty-state"><div>Failed to load diff</div></div>';
        document.getElementById('diffViewToggle').style.display = 'none';
      }
    }

    function setDiffView(mode) {
      diffViewMode = mode;
      document.getElementById('btnUnified').classList.toggle('active', mode === 'unified');
      document.getElementById('btnSplit').classList.toggle('active', mode === 'split');
      if (currentDiff) {
        renderDiff(currentDiff);
      }
    }

    function renderDiff(diff) {
      const container = document.getElementById('diffContent');

      if (!diff) {
        container.innerHTML = '<div class="empty-state"><div>No diff available</div></div>';
        return;
      }

      if (diffViewMode === 'split') {
        renderSplitDiff(diff, container);
      } else {
        renderUnifiedDiff(diff, container);
      }
    }

    function renderUnifiedDiff(diff, container) {
      const lines = diff.split('\\n');
      const isNewFile = diff.includes('new file mode') || diff.includes('--- /dev/null');
      let html = '<div class="diff-unified">';
      let lineNum = 0;

      // For new files, show plain content
      if (isNewFile) {
        let inContent = false;
        for (const line of lines) {
          if (line.startsWith('@@')) {
            inContent = true;
            continue;
          }
          if (!inContent) continue;
          if (line.startsWith('+')) {
            lineNum++;
            const content = line.substring(1);
            html += \`<div class="diff-line add"><span class="line-num">\${lineNum}</span>\${escapeHtml(content)}</div>\`;
          }
        }
      } else {
        // Regular diff view - skip header lines and hunk headers
        for (const line of lines) {
          if (line.startsWith('diff --git') || line.startsWith('index ') ||
                     line.startsWith('---') || line.startsWith('+++') ||
                     line.startsWith('new file') || line.startsWith('deleted file')) {
            continue; // Skip header lines
          } else if (line.startsWith('@@')) {
            // Parse line number but don't display hunk header
            const match = line.match(/@@ -(\\d+)/);
            if (match) lineNum = parseInt(match[1]) - 1;
          } else if (line.startsWith('-')) {
            lineNum++;
            html += \`<div class="diff-line del"><span class="line-num">\${lineNum}</span>\${escapeHtml(line)}</div>\`;
          } else if (line.startsWith('+')) {
            html += \`<div class="diff-line add"><span class="line-num"></span>\${escapeHtml(line)}</div>\`;
          } else {
            lineNum++;
            html += \`<div class="diff-line"><span class="line-num">\${lineNum}</span>\${escapeHtml(line)}</div>\`;
          }
        }
      }

      html += '</div>';
      container.innerHTML = html;
    }

    function renderSplitDiff(diff, container) {
      const lines = diff.split('\\n');
      const isNewFile = diff.includes('new file mode') || diff.includes('--- /dev/null');

      // For new files, show single pane with content
      if (isNewFile) {
        let rightLines = [];
        let lineNum = 0;
        let inContent = false;

        for (const line of lines) {
          if (line.startsWith('@@')) {
            inContent = true;
            continue;
          }
          if (!inContent) continue;
          if (line.startsWith('+')) {
            lineNum++;
            rightLines.push({ type: 'add', content: line.substring(1), num: lineNum });
          }
        }

        const renderPane = (lines, title) => {
          let html = \`<div class="diff-split-pane-header">\${title}</div><div class="diff-split-pane-content">\`;
          for (const line of lines) {
            const numHtml = \`<span class="line-num">\${line.num}</span>\`;
            html += \`<div class="diff-line \${line.type}">\${numHtml}\${escapeHtml(line.content)}</div>\`;
          }
          html += '</div>';
          return html;
        };

        container.innerHTML = \`
          <div class="diff-split">
            <div class="diff-split-pane" style="flex: 1;">\${renderPane(rightLines, 'New File')}</div>
          </div>
        \`;
        return;
      }

      let leftLines = [];
      let rightLines = [];
      let leftLineNum = 0;
      let rightLineNum = 0;
      let inHunk = false;

      for (const line of lines) {
        if (line.startsWith('@@')) {
          // Parse line numbers but don't display hunk header
          const match = line.match(/@@ -(\\d+)(?:,\\d+)? \\+(\\d+)/);
          if (match) {
            leftLineNum = parseInt(match[1]) - 1;
            rightLineNum = parseInt(match[2]) - 1;
          }
          inHunk = true;
        } else if (line.startsWith('diff --git') || line.startsWith('index ') ||
                   line.startsWith('---') || line.startsWith('+++') ||
                   line.startsWith('new file') || line.startsWith('deleted file')) {
          // Skip header lines in split view
        } else if (line.startsWith('-')) {
          leftLineNum++;
          leftLines.push({ type: 'del', content: line.substring(1), num: leftLineNum });
          rightLines.push({ type: 'empty', content: '', num: '' });
        } else if (line.startsWith('+')) {
          rightLineNum++;
          leftLines.push({ type: 'empty', content: '', num: '' });
          rightLines.push({ type: 'add', content: line.substring(1), num: rightLineNum });
        } else if (inHunk) {
          leftLineNum++;
          rightLineNum++;
          leftLines.push({ type: 'context', content: line.substring(1) || line, num: leftLineNum });
          rightLines.push({ type: 'context', content: line.substring(1) || line, num: rightLineNum });
        }
      }

      // Pair up consecutive del/add as modifications
      const pairedLeft = [];
      const pairedRight = [];
      let i = 0;
      while (i < leftLines.length) {
        // Collect consecutive dels
        const dels = [];
        while (i < leftLines.length && leftLines[i].type === 'del' && rightLines[i].type === 'empty') {
          dels.push(leftLines[i]);
          i++;
        }
        // Collect consecutive adds
        const adds = [];
        while (i < leftLines.length && leftLines[i].type === 'empty' && rightLines[i].type === 'add') {
          adds.push(rightLines[i]);
          i++;
        }
        // Pair them up
        const maxLen = Math.max(dels.length, adds.length);
        for (let j = 0; j < maxLen; j++) {
          pairedLeft.push(dels[j] || { type: 'empty', content: '', num: '' });
          pairedRight.push(adds[j] || { type: 'empty', content: '', num: '' });
        }
        // If no dels or adds, just push the current line
        if (dels.length === 0 && adds.length === 0 && i < leftLines.length) {
          pairedLeft.push(leftLines[i]);
          pairedRight.push(rightLines[i]);
          i++;
        }
      }

      const renderPane = (lines, title) => {
        let html = \`<div class="diff-split-pane-header">\${title}</div><div class="diff-split-pane-content">\`;
        for (const line of lines) {
          const numHtml = line.num ? \`<span class="line-num">\${line.num}</span>\` : '<span class="line-num"></span>';
          html += \`<div class="diff-line \${line.type}">\${numHtml}\${escapeHtml(line.content)}</div>\`;
        }
        html += '</div>';
        return html;
      };

      container.innerHTML = \`
        <div class="diff-split">
          <div class="diff-split-pane">\${renderPane(pairedLeft, 'Original')}</div>
          <div class="diff-split-pane">\${renderPane(pairedRight, 'Modified')}</div>
        </div>
      \`;
    }

    async function analyzeSelected() {
      if (selectedFiles.size === 0) return;
      if (isLoading) return;

      isLoading = true;
      showLoader('Analyzing changes with AI...');

      // Extract unique file names from selected file keys (format: "file:staged" or "file:unstaged")
      const fileNames = [...new Set([...selectedFiles].map(key => {
        const parts = key.split(':');
        parts.pop(); // Remove "staged" or "unstaged"
        return parts.join(':'); // Rejoin in case filename has colons
      }))];

      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: fileNames })
        });
        const data = await res.json();

        if (data.error) {
          showToast(data.error, 'error');
        } else {
          commitGroups = data.groups;
          showCommitPanel();
        }
      } catch (err) {
        console.error('Analyze error:', err);
        showToast('Failed to analyze: ' + (err.message || err), 'error');
      }

      hideLoader();
      isLoading = false;
    }

    // Store parsed diffs for hunk extraction
    let parsedDiffs = {};

    // Parse diff into hunks
    function parseDiffIntoHunks(diff) {
      const hunks = [];
      const lines = diff.split('\\n');
      let currentHunk = null;
      let hunkIndex = -1;

      for (const line of lines) {
        if (line.startsWith('diff --git') || line.startsWith('index ') ||
            line.startsWith('---') || line.startsWith('+++') ||
            line.startsWith('new file') || line.startsWith('deleted file')) {
          continue;
        }

        if (line.startsWith('@@')) {
          // Start new hunk
          if (currentHunk) {
            hunks.push(currentHunk);
          }
          hunkIndex++;
          const match = line.match(/@@ -(\\d+)/);
          currentHunk = {
            index: hunkIndex,
            startLine: match ? parseInt(match[1]) : 1,
            lines: []
          };
          continue;
        }

        if (currentHunk) {
          currentHunk.lines.push(line);
        }
      }

      if (currentHunk) {
        hunks.push(currentHunk);
      }

      return hunks;
    }

    // Render specific hunks
    function renderHunks(hunks, hunkIndices) {
      let html = '';
      let selectedHunks = hunks;

      // If hunkIndices specified, filter to those hunks
      if (hunkIndices && hunkIndices.length > 0) {
        const filtered = hunks.filter(h => hunkIndices.includes(h.index));
        // Only use filtered if we found matches, otherwise show all
        if (filtered.length > 0) {
          selectedHunks = filtered;
        }
      }

      for (const hunk of selectedHunks) {
        let lineNum = hunk.startLine - 1;
        for (const line of hunk.lines) {
          if (line.startsWith('-')) {
            lineNum++;
            html += '<div class="diff-line del"><span class="diff-line-num">' + lineNum + '</span>' + escapeHtml(line) + '</div>';
          } else if (line.startsWith('+')) {
            html += '<div class="diff-line add"><span class="diff-line-num"></span>' + escapeHtml(line) + '</div>';
          } else {
            lineNum++;
            html += '<div class="diff-line"><span class="diff-line-num">' + lineNum + '</span>' + escapeHtml(line) + '</div>';
          }
        }
      }

      return html;
    }

    // Toggle file diff visibility
    function toggleFileDiff(elementId) {
      const diffEl = document.getElementById(elementId);
      const chevron = diffEl.previousElementSibling.querySelector('.group-file-chevron');
      diffEl.classList.toggle('collapsed');
      chevron.classList.toggle('collapsed');
    }

    // Toggle commit group visibility
    function toggleCommitGroup(groupId) {
      const content = document.getElementById(groupId);
      const header = content.previousElementSibling;
      const chevron = header.querySelector('.group-chevron');
      content.classList.toggle('collapsed');
      chevron.classList.toggle('collapsed');
    }

    async function showCommitPanel() {
      if (!commitGroups || commitGroups.length === 0) return;

      const diffContent = document.getElementById('diffContent');
      const diffViewToggle = document.getElementById('diffViewToggle');

      // We're now viewing the commit plan
      viewingCommitPlan = true;

      // Hide commit plan button (we're already viewing it)
      document.getElementById('commitPlanBtn').style.display = 'none';

      // Hide diff view toggle
      diffViewToggle.style.display = 'none';

      // Update header
      document.getElementById('diffFilename').textContent = 'Commit Plan';

      // Icons
      const fileIcon = '<svg class="group-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>';
      const chevronIcon = '<svg class="group-file-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

      let html = '<div class="commit-plan-view">';
      html += '<div class="commit-plan-header">';
      html += '<span class="commit-plan-title">' + commitGroups.length + ' commit(s) will be created</span>';
      html += '<div class="commit-plan-actions">';
      html += '<button class="btn btn-secondary" onclick="hideCommitPanel()">Cancel</button>';
      html += '<button class="btn btn-success" onclick="executeCommits()">';
      html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13l4 4L19 7"/></svg>';
      html += 'Create Commits</button>';
      html += '</div></div>';

      // First, load all diffs and parse them
      const allFiles = new Set();
      for (const g of commitGroups) {
        const groupFiles = g.files || [...new Set((g.hunks || []).map(h => h.file))];
        groupFiles.forEach(f => allFiles.add(f));
      }

      // Load and parse all diffs
      parsedDiffs = {};
      for (const file of allFiles) {
        const fileInfo = files.find(f => f.file === file);
        const status = fileInfo ? fileInfo.status : 'modified';
        try {
          const res = await fetch('/api/diff?file=' + encodeURIComponent(file) + '&status=' + status + '&t=' + Date.now());
          const diff = await res.text();
          if (diff) {
            parsedDiffs[file] = parseDiffIntoHunks(diff);
          }
        } catch (e) {
          parsedDiffs[file] = [];
        }
      }

      // Build each commit group with file diffs
      const groupChevron = '<svg class="group-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';

      for (let i = 0; i < commitGroups.length; i++) {
        const g = commitGroups[i];
        const groupHunks = g.hunks || [];
        const groupFiles = g.files || [...new Set(groupHunks.map(h => h.file))];
        const groupContentId = 'groupContent_' + i;

        html += '<div class="commit-group">';
        html += '<div class="group-header" onclick="toggleCommitGroup(\\'' + groupContentId + '\\')">';
        html += groupChevron;
        html += '<span class="group-number">' + (i + 1) + '</span>';
        html += '<span class="group-message">' + escapeHtml(g.commitMessage) + '</span>';
        html += '<span style="color: #6e7681; margin-left: auto; font-size: 11px;">' + groupFiles.length + ' file(s)</span>';
        html += '</div>';

        html += '<div class="group-content" id="' + groupContentId + '">';

        // Show diff for each file with only the relevant hunks
        for (const file of groupFiles) {
          const diffId = 'commitDiff_' + i + '_' + file.replace(/[^a-zA-Z0-9]/g, '_');

          // Get hunk indices for this file in this group
          const fileHunks = groupHunks.filter(h => h.file === file);
          const hunkIndices = fileHunks.length > 0 ? fileHunks.map(h => h.hunkIndex) : null;

          // Render only the relevant hunks
          const fileDiffHunks = parsedDiffs[file] || [];
          const diffHtml = renderHunks(fileDiffHunks, hunkIndices);

          html += '<div class="group-file-section">';
          html += '<div class="group-file-header" onclick="event.stopPropagation(); toggleFileDiff(\\'' + diffId + '\\')">';
          html += chevronIcon + fileIcon + escapeHtml(file);
          if (hunkIndices) {
            html += '<span style="color: #6e7681; margin-left: auto; font-size: 11px;">' + hunkIndices.length + ' hunk(s)</span>';
          }
          html += '</div>';
          html += '<div class="group-file-diff" id="' + diffId + '">';
          html += diffHtml || '<div style="padding: 8px 16px; color: #6e7681;">No changes</div>';
          html += '</div>';
          html += '</div>';
        }

        html += '</div>'; // group-content
        html += '</div>'; // commit-group
      }

      html += '</div>';
      diffContent.innerHTML = html;
    }

    function hideCommitPanel() {
      commitGroups = null;
      currentFile = null;
      currentFileStaged = null;
      currentDiff = null;
      viewingCommitPlan = false;

      // Hide commit plan button
      document.getElementById('commitPlanBtn').style.display = 'none';

      document.getElementById('diffFilename').textContent = 'Select a file to view changes';
      document.getElementById('diffViewToggle').style.display = 'none';
      document.getElementById('diffContent').innerHTML = \`
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div>Select a file to view diff</div>
        </div>
      \`;
    }

    async function executeCommits() {
      if (!commitGroups || commitGroups.length === 0) return;
      if (isLoading) return;

      isLoading = true;
      showLoader('Creating commits...');

      try {
        const res = await fetch('/api/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groups: commitGroups })
        });
        const data = await res.json();

        if (data.error) {
          showToast(data.error, 'error');
        } else {
          showToast(\`Successfully created \${data.committed} commit(s)!\`, 'success');
          hideCommitPanel();
          selectedFiles.clear();
          await refreshFiles();
        }
      } catch (err) {
        showToast('Failed to create commits', 'error');
      }

      hideLoader();
      isLoading = false;
    }

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type + ' show';
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function showLoader(text = 'Loading...') {
      document.getElementById('loaderText').textContent = text;
      document.getElementById('loader').classList.add('show');
    }

    function hideLoader() {
      document.getElementById('loader').classList.remove('show');
    }

    function escapeHtml(text) {
      return text?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') || '';
    }
  </script>
</body>
</html>`;
}

function openBrowser(url: string): void {
  const { exec } = require("child_process");
  const cmd = process.platform === "darwin"
    ? `open "${url}"`
    : process.platform === "win32"
      ? `start "${url}"`
      : `xdg-open "${url}"`;

  exec(cmd, (err: Error | null) => {
    if (err) {
      console.log(chalk.yellow(`Open manually: ${url}`));
    }
  });
}

export async function runUI(): Promise<void> {
  console.log(chalk.blue.bold("\n🎨 Git AI - Commit Manager\n"));

  if (!(await git.isGitRepository())) {
    console.log(chalk.red("❌ Not a git repository\n"));
    return;
  }

  const apiKey = await getOpenAIKey();
  if (!apiKey) {
    console.log(chalk.red("❌ OpenAI API key not configured. Run: git-ai setup\n"));
    return;
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";
    const method = req.method || "GET";

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // SSE: Real-time file change notifications
    if (url === "/api/events" && method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(`data: connected\n\n`);
      sseClients.add(res);

      req.on("close", () => {
        sseClients.delete(res);
      });
      return;
    }

    // API: Get changed files
    if (url.startsWith("/api/files") && method === "GET") {
      try {
        const files = await git.getChangedFiles();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(files));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
      return;
    }

    // API: Stage a file
    if (url === "/api/stage" && method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { file } = JSON.parse(body);
          await git.stageFile(file);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          notifyClients();
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // API: Unstage a file
    if (url === "/api/unstage" && method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { file } = JSON.parse(body);
          await git.unstageFile(file);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
          notifyClients();
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // API: Get diff for a file
    if (url.startsWith("/api/diff") && method === "GET") {
      const params = new URLSearchParams(url.split("?")[1] || "");
      const file = params.get("file") || "";
      const status = params.get("status") || "";
      const stagedParam = params.get("staged");
      const staged = stagedParam === "true" ? true : stagedParam === "false" ? false : undefined;
      try {
        const diff = await getFileDiff(file, status, staged);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(diff);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("");
      }
      return;
    }

    // API: Analyze selected files
    if (url === "/api/analyze" && method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { files: selectedFiles } = JSON.parse(body);

          // Get file list to check status
          const changedFiles = await git.getChangedFiles();

          // Get diff for each selected file
          const diffs: string[] = [];
          for (const file of selectedFiles) {
            const fileInfo = changedFiles.find((f) => f.file === file);
            const status = fileInfo ? fileInfo.status : "modified";
            const diff = await getFileDiff(file, status);
            if (diff) {
              diffs.push(diff);
            }
          }

          const rawDiff = diffs.join("\n");

          if (!rawDiff) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No diff found for selected files" }));
            return;
          }

          // Parse diff into hunks using hunk-parser (same as commit.ts)
          let fileDiffs: FileDiff[] = rawDiff.trim() ? parseDiff(rawDiff) : [];

          // Add untracked/new files that weren't in diff
          const parsedFiles = new Set(fileDiffs.map(f => f.file));
          for (const file of selectedFiles) {
            if (!parsedFiles.has(file)) {
              const fileInfo = changedFiles.find((f) => f.file === file);
              if (fileInfo) {
                fileDiffs.push({
                  file: fileInfo.file,
                  isNew: fileInfo.status === "new",
                  isDeleted: fileInfo.status === "deleted",
                  isBinary: fileInfo.isBinary,
                  hunks: [{
                    file: fileInfo.file,
                    index: 0,
                    header: fileInfo.status === "new" ? "[NEW]" : "[FILE]",
                    content: "",
                    summary: fileInfo.status === "new" ? "New file" :
                             fileInfo.status === "deleted" ? "Deleted file" : "Modified file"
                  }]
                });
              }
            }
          }

          if (fileDiffs.length === 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "No changes found for selected files" }));
            return;
          }

          // Format for AI (with hunk indices)
          const formattedDiff = formatForAI(fileDiffs);
          const stats = getStats(fileDiffs);

          // Analyze with AI
          const result = await openai.analyzeAndGroup(formattedDiff, stats, apiKey);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // API: Execute commits
    if (url === "/api/commit" && method === "POST") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { groups } = JSON.parse(body);
          let committed = 0;

          for (const group of groups) {
            // Get files from either 'files' array or extract from 'hunks'
            const files = group.files || [...new Set((group.hunks || []).map((h: { file: string }) => h.file))];

            // Stage files for this group
            await git.unstageAll();
            await git.stageFiles(files);

            // Create commit
            const message = group.commitBody
              ? `${group.commitMessage}\n\n${group.commitBody}`
              : group.commitMessage;

            await git.createCommit(message);
            committed++;
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, committed }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    // Default: serve HTML
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getHtml());
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.log(chalk.red(`\n❌ Port ${PORT} is already in use.`));
      console.log(chalk.gray(`Run: lsof -ti:${PORT} | xargs kill -9\n`));
    } else {
      console.log(chalk.red(`\n❌ Server error: ${err.message}\n`));
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(chalk.green(`✓ Server running at ${url}`));
    console.log(chalk.gray("Press Ctrl+C to stop\n"));
    startFileWatcher();
    openBrowser(url);
  });

  process.on("SIGINT", () => {
    stopFileWatcher();
    console.log(chalk.yellow("\n\n👋 Server stopped\n"));
    server.close();
    process.exit(0);
  });
}
