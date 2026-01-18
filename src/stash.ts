import * as http from "http";
import { exec } from "child_process";
import chalk from "chalk";
import * as git from "./git";

const PORT = 3847;


interface StashData {
  stashes: git.StashEntry[];
  diffs: Map<number, string>;
  files: Map<number, string[]>;
}

function getHtml(data: StashData): string {
  const stashesJson = JSON.stringify(data.stashes);
  const diffsJson: Record<number, string> = {};
  const filesJson: Record<number, string[]> = {};

  data.diffs.forEach((v, k) => { diffsJson[k] = v; });
  data.files.forEach((v, k) => { filesJson[k] = v; });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Git Stash Viewer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1e1e;
      color: #cccccc;
      height: 100vh;
      overflow: hidden;
    }
    .container { display: flex; height: 100vh; }

    /* Sidebar */
    .sidebar {
      width: 300px;
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
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #bbbbbb;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .back-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: none;
      border: none;
      color: #58a6ff;
      cursor: pointer;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.1s;
    }
    .back-btn:hover { background: #3c3c3c; }
    .back-btn svg {
      width: 14px;
      height: 14px;
    }
    .stash-title {
      color: #4ec9b0;
      font-size: 12px;
      font-weight: 500;
      text-transform: none;
      letter-spacing: normal;
    }
    .sidebar-footer {
      padding: 14px 16px;
      border-top: 1px solid #3c3c3c;
      background: #1e1e1e;
      text-align: center;
    }
    .sidebar-footer-brand {
      font-size: 13px;
      font-weight: 600;
      color: #e1e1e1;
      margin-bottom: 6px;
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
    .stash-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
    }
    .stash-actions button {
      flex: 1;
      padding: 8px 12px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 0.15s, opacity 0.15s;
    }
    .stash-actions button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .stash-actions button svg {
      width: 14px;
      height: 14px;
    }
    .btn-apply {
      background: #238636;
      color: #fff;
    }
    .btn-apply:hover:not(:disabled) {
      background: #2ea043;
    }
    .btn-delete {
      background: #da3633;
      color: #fff;
    }
    .btn-delete:hover:not(:disabled) {
      background: #f85149;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      font-size: 13px;
      color: #fff;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.2s, transform 0.2s;
      z-index: 1000;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0);
    }
    .toast.success { background: #238636; }
    .toast.error { background: #da3633; }
    .sidebar-content {
      flex: 1;
      overflow-y: auto;
    }

    /* Stash List View */
    .stash-item {
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1px solid #2d2d2d;
      transition: background 0.1s;
    }
    .stash-item:hover { background: #2a2d2e; }
    .stash-index {
      color: #4ec9b0;
      font-size: 12px;
      font-weight: 600;
    }
    .stash-message {
      font-size: 13px;
      margin-top: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .stash-meta {
      font-size: 11px;
      color: #808080;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .stash-files-count {
      background: #3c3c3c;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
    }

    /* File List View */
    .file-item {
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
      font-family: 'SF Mono', Monaco, monospace;
      border-bottom: 1px solid #2d2d2d;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.1s;
    }
    .file-item:hover { background: #2a2d2e; }
    .file-item.active { background: #094771; }
    .file-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #e2c08d;
    }
    .file-status.new { background: #73c991; }
    .file-status.deleted { background: #f14c4c; }
    .file-name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-path {
      color: #6e7681;
      font-size: 11px;
    }
    .all-changes-item {
      padding: 10px 16px;
      cursor: pointer;
      font-size: 13px;
      border-bottom: 1px solid #3c3c3c;
      background: #2d2d2d;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.1s;
    }
    .all-changes-item:hover { background: #3c3c3c; }
    .all-changes-item.active { background: #094771; }
    .all-changes-item svg {
      width: 16px;
      height: 16px;
      color: #58a6ff;
    }

    /* Main Content */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .toolbar {
      padding: 8px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .toolbar-file {
      font-family: 'SF Mono', Monaco, monospace;
      color: #dcdcaa;
    }
    .diff-container {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .diff-pane {
      flex: 1;
      overflow: auto;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 13px;
      line-height: 20px;
    }
    .diff-pane.old { background: #1e1e1e; border-right: 1px solid #3c3c3c; }
    .diff-pane.new { background: #1e1e1e; }
    .diff-pane-header {
      padding: 8px 16px;
      background: #2d2d2d;
      border-bottom: 1px solid #3c3c3c;
      font-size: 12px;
      color: #808080;
      position: sticky;
      top: 0;
    }
    .diff-line {
      padding: 0 16px;
      white-space: pre;
      min-height: 20px;
    }
    .diff-line.add { background: #2ea04326; color: #3fb950; }
    .diff-line.del { background: #f8514926; color: #f85149; }
    .diff-line.hunk { background: #388bfd26; color: #58a6ff; }
    .line-num {
      display: inline-block;
      width: 40px;
      color: #6e7681;
      text-align: right;
      margin-right: 16px;
      user-select: none;
    }

    /* Empty State */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #6e7681;
    }
    .empty-state svg {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: #1e1e1e; }
    ::-webkit-scrollbar-thumb { background: #424242; border-radius: 5px; }
    ::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }

    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="sidebar-header" id="sidebarHeader">
        <span id="headerTitle">Stashes</span>
      </div>
      <div class="sidebar-content" id="sidebarContent"></div>
      <div class="sidebar-footer">
        <div class="sidebar-footer-brand">git-ai</div>
        <a href="https://github.com/mehmetsagir/git-ai" target="_blank">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Open source on GitHub
        </a>
      </div>
    </div>
    <div class="main">
      <div class="toolbar" id="toolbar" style="display:none;">
        <span class="toolbar-file" id="toolbarFile"></span>
      </div>
      <div class="diff-container" id="diffContainer">
        <div class="empty-state" id="emptyState">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div>Select a stash to view changes</div>
        </div>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
    let stashes = ${stashesJson};
    let diffs = ${JSON.stringify(diffsJson)};
    let files = ${JSON.stringify(filesJson)};
    let isLoading = false;

    let currentView = 'list'; // 'list' or 'detail'
    let selectedStash = null;
    let selectedFile = null;

    function renderStashList() {
      currentView = 'list';
      selectedStash = null;
      selectedFile = null;

      // Update header
      document.getElementById('sidebarHeader').innerHTML = '<span id="headerTitle">Stashes</span>';

      // Hide toolbar and show empty state
      document.getElementById('toolbar').style.display = 'none';
      document.getElementById('diffContainer').innerHTML = \`
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div>Select a stash to view changes</div>
        </div>
      \`;

      // Render stash list
      const content = document.getElementById('sidebarContent');
      if (stashes.length === 0) {
        content.innerHTML = '<div style="padding:20px;color:#6e7681;text-align:center;">No stashes found</div>';
        return;
      }

      content.innerHTML = stashes.map(s => {
        const date = new Date(s.date).toLocaleDateString();
        const fileCount = (files[s.index] || []).length;
        return \`
          <div class="stash-item" onclick="openStash(\${s.index})">
            <div class="stash-index">stash@{\${s.index}}</div>
            <div class="stash-message">\${escapeHtml(s.message)}</div>
            <div class="stash-meta">
              <span>\${s.branch}</span>
              <span>\${date}</span>
              <span class="stash-files-count">\${fileCount} file\${fileCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    function openStash(index) {
      currentView = 'detail';
      selectedStash = index;
      selectedFile = null;

      const stash = stashes.find(s => s.index === index);
      const stashFiles = files[index] || [];

      // Update header with back button
      document.getElementById('sidebarHeader').innerHTML = \`
        <button class="back-btn" onclick="renderStashList()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          Back
        </button>
        <span class="stash-title">stash@{\${index}}</span>
      \`;

      // Render file list with action buttons
      const content = document.getElementById('sidebarContent');
      let html = \`
        <div class="stash-actions">
          <button class="btn-apply" onclick="applyStash(\${index})" \${isLoading ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 13l4 4L19 7"/>
            </svg>
            Apply
          </button>
          <button class="btn-delete" onclick="deleteStash(\${index})" \${isLoading ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Delete
          </button>
        </div>
        <div class="all-changes-item active" onclick="showAllChanges()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          All Changes
        </div>
      \`;

      html += stashFiles.map(f => {
        const isNew = diffs[index]?.includes('new file mode') && diffs[index]?.includes(f);
        const isDel = diffs[index]?.includes('deleted file mode') && diffs[index]?.includes(f);
        const statusCls = isDel ? 'deleted' : (isNew ? 'new' : '');
        const fileName = f.split('/').pop();
        const dirPath = f.includes('/') ? f.substring(0, f.lastIndexOf('/')) : '';
        return \`
          <div class="file-item" data-file="\${escapeHtml(f)}" onclick="selectFile('\${escapeHtml(f)}')">
            <div class="file-status \${statusCls}"></div>
            <div class="file-name">
              \${escapeHtml(fileName)}
              \${dirPath ? \`<span class="file-path">\${escapeHtml(dirPath)}</span>\` : ''}
            </div>
          </div>
        \`;
      }).join('');

      content.innerHTML = html;

      // Show full diff by default
      showAllChanges();
    }

    function showAllChanges() {
      selectedFile = null;
      updateFileSelection();

      const diff = diffs[selectedStash] || '';
      document.getElementById('toolbar').style.display = 'flex';
      document.getElementById('toolbarFile').textContent = 'All Changes';
      renderSplitDiff(diff);
    }

    function selectFile(filename) {
      selectedFile = filename;
      updateFileSelection();

      const fullDiff = diffs[selectedStash] || '';
      document.getElementById('toolbar').style.display = 'flex';
      document.getElementById('toolbarFile').textContent = filename;

      const fileDiff = extractFileDiff(fullDiff, filename);
      renderSplitDiff(fileDiff);
    }

    function updateFileSelection() {
      // Update all changes item
      document.querySelectorAll('.all-changes-item').forEach(el => {
        el.classList.toggle('active', selectedFile === null);
      });

      // Update file items
      document.querySelectorAll('.file-item').forEach(el => {
        el.classList.toggle('active', el.dataset.file === selectedFile);
      });
    }

    function extractFileDiff(fullDiff, filename) {
      const parts = fullDiff.split(/(?=diff --git )/);
      for (const part of parts) {
        if (part.includes(filename)) {
          return part;
        }
      }
      return '';
    }

    function renderSplitDiff(diff) {
      const container = document.getElementById('diffContainer');

      if (!diff) {
        container.innerHTML = '<div class="empty-state"><div>No changes to display</div></div>';
        return;
      }

      const lines = diff.split('\\n');
      let oldLines = [];
      let newLines = [];
      let oldNum = 0, newNum = 0;

      for (const line of lines) {
        if (line.startsWith('@@')) {
          const match = line.match(/@@ -(\\d+)/);
          if (match) oldNum = parseInt(match[1]) - 1;
          const match2 = line.match(/\\+(\\d+)/);
          if (match2) newNum = parseInt(match2[1]) - 1;
          oldLines.push({ type: 'hunk', text: line, num: '' });
          newLines.push({ type: 'hunk', text: line, num: '' });
        } else if (line.startsWith('diff --git') || line.startsWith('index ') ||
                   line.startsWith('---') || line.startsWith('+++') ||
                   line.startsWith('new file') || line.startsWith('deleted file')) {
          // Skip header lines
        } else if (line.startsWith('-')) {
          oldNum++;
          oldLines.push({ type: 'del', text: line.substring(1), num: oldNum });
          newLines.push({ type: 'empty', text: '', num: '' });
        } else if (line.startsWith('+')) {
          newNum++;
          oldLines.push({ type: 'empty', text: '', num: '' });
          newLines.push({ type: 'add', text: line.substring(1), num: newNum });
        } else if (line.startsWith(' ') || line === '') {
          oldNum++;
          newNum++;
          oldLines.push({ type: 'context', text: line.substring(1) || '', num: oldNum });
          newLines.push({ type: 'context', text: line.substring(1) || '', num: newNum });
        }
      }

      container.innerHTML = \`
        <div class="diff-pane old">
          <div class="diff-pane-header">Original</div>
          \${oldLines.map(l => \`<div class="diff-line \${l.type}"><span class="line-num">\${l.num}</span>\${escapeHtml(l.text)}</div>\`).join('')}
        </div>
        <div class="diff-pane new">
          <div class="diff-pane-header">Modified</div>
          \${newLines.map(l => \`<div class="diff-line \${l.type}"><span class="line-num">\${l.num}</span>\${escapeHtml(l.text)}</div>\`).join('')}
        </div>
      \`;

      // Sync scroll
      const oldPane = container.querySelector('.diff-pane.old');
      const newPane = container.querySelector('.diff-pane.new');
      oldPane.addEventListener('scroll', () => { newPane.scrollTop = oldPane.scrollTop; });
      newPane.addEventListener('scroll', () => { oldPane.scrollTop = newPane.scrollTop; });
    }

    function escapeHtml(text) {
      return text?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') || '';
    }

    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type + ' show';
      setTimeout(() => { toast.classList.remove('show'); }, 3000);
    }

    async function refreshData() {
      const res = await fetch('/api/data');
      const data = await res.json();
      stashes = data.stashes;
      diffs = data.diffs;
      files = data.files;
    }

    async function applyStash(index) {
      if (isLoading) return;
      isLoading = true;

      try {
        const res = await fetch('/api/apply/' + index, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          showToast('Stash applied successfully!', 'success');
          await refreshData();
          renderStashList();
        } else {
          showToast('Failed to apply stash: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        showToast('Failed to apply stash', 'error');
      }

      isLoading = false;
    }

    async function deleteStash(index) {
      if (isLoading) return;
      if (!confirm('Are you sure you want to delete this stash? This cannot be undone.')) return;

      isLoading = true;

      try {
        const res = await fetch('/api/drop/' + index, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          showToast('Stash deleted successfully!', 'success');
          await refreshData();
          renderStashList();
        } else {
          showToast('Failed to delete stash: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        showToast('Failed to delete stash', 'error');
      }

      isLoading = false;
    }

    // Initial render
    renderStashList();
  </script>
</body>
</html>`;
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin"
    ? `open "${url}"`
    : process.platform === "win32"
      ? `start "${url}"`
      : `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      console.log(chalk.yellow(`Open manually: ${url}`));
    }
  });
}

export async function runStashViewer(): Promise<void> {
  console.log(chalk.blue.bold("\n📦 Git Stash Viewer\n"));

  if (!(await git.isGitRepository())) {
    console.log(chalk.red("❌ Not a git repository\n"));
    return;
  }

  console.log(chalk.gray("Loading stashes..."));

  const stashes = await git.getStashList();
  const diffs = new Map<number, string>();
  const files = new Map<number, string[]>();

  for (const stash of stashes) {
    const diff = await git.getStashDiff(stash.index);
    const fileList = await git.getStashFiles(stash.index);
    diffs.set(stash.index, diff);
    files.set(stash.index, fileList);
  }

  console.log(chalk.green(`✓ Found ${stashes.length} stash(es)`));

  let data: StashData = { stashes, diffs, files };

  async function reloadStashes(): Promise<void> {
    const newStashes = await git.getStashList();
    const newDiffs = new Map<number, string>();
    const newFiles = new Map<number, string[]>();

    for (const stash of newStashes) {
      const diff = await git.getStashDiff(stash.index);
      const fileList = await git.getStashFiles(stash.index);
      newDiffs.set(stash.index, diff);
      newFiles.set(stash.index, fileList);
    }

    data = { stashes: newStashes, diffs: newDiffs, files: newFiles };
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url || "/";

    // API: Apply stash
    if (url.startsWith("/api/apply/") && req.method === "POST") {
      const index = parseInt(url.split("/").pop() || "");
      try {
        await git.applyStash(index);
        await reloadStashes();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
      return;
    }

    // API: Drop stash
    if (url.startsWith("/api/drop/") && req.method === "POST") {
      const index = parseInt(url.split("/").pop() || "");
      try {
        await git.dropStash(index);
        await reloadStashes();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: String(err) }));
      }
      return;
    }

    // API: Get fresh data
    if (url === "/api/data" && req.method === "GET") {
      const diffsJson: Record<number, string> = {};
      const filesJson: Record<number, string[]> = {};
      data.diffs.forEach((v, k) => { diffsJson[k] = v; });
      data.files.forEach((v, k) => { filesJson[k] = v; });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ stashes: data.stashes, diffs: diffsJson, files: filesJson }));
      return;
    }

    // Default: serve HTML
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getHtml(data));
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
    console.log(chalk.blue(`\n🌐 Server running at ${url}`));
    console.log(chalk.gray("Press Ctrl+C to stop\n"));
    openBrowser(url);
  });

  process.on("SIGINT", () => {
    console.log(chalk.yellow("\n\n👋 Server stopped\n"));
    server.close();
    process.exit(0);
  });
}
