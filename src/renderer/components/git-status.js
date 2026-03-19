/**
 * GitStatus - Displays git repository status in the bottom panel.
 *
 * Shows: current branch, staged/unstaged changes, recent commit log.
 * Refreshes when the terminal CWD changes (via store subscription).
 */
export class GitStatus {
    constructor(parentId, { store } = {}) {
        this._store = store || null;
        this._unsubs = [];
        this._refreshInterval = null;
        this._currentCwd = null;
        this._isGitRepo = false;

        this.parent = typeof parentId === 'string'
            ? document.getElementById(parentId)
            : parentId;

        this._createDOM();

        if (this._store) {
            // Refresh when active terminal changes CWD
            this._unsubs.push(
                this._store.on('git.cwd', (cwd) => {
                    if (cwd) this.refresh(cwd);
                })
            );
        }

        // Auto-refresh every 5 seconds (only when the panel is visible)
        this._refreshInterval = setInterval(() => {
            if (this._currentCwd && this.parent.offsetParent !== null) {
                this.refresh(this._currentCwd);
            }
        }, 5000);
    }

    _createDOM() {
        this.parent.innerHTML = '';

        this._headerEl = document.createElement('div');
        this._headerEl.className = 'git-status-header';
        this._headerEl.innerHTML = '<span class="git-status-title">GIT STATUS</span><span class="git-branch"></span>';
        this.parent.appendChild(this._headerEl);

        this._contentEl = document.createElement('div');
        this._contentEl.className = 'git-status-content';
        this.parent.appendChild(this._contentEl);

        this._showEmpty();
    }

    _showEmpty() {
        this._contentEl.innerHTML = '<div class="git-empty">Not a git repository</div>';
    }

    async refresh(cwd) {
        if (!cwd) return;
        this._currentCwd = cwd;

        try {
            const result = await window.edex.git.status(cwd);
            if (!result) {
                this._isGitRepo = false;
                this._showEmpty();
                return;
            }
            this._isGitRepo = true;
            this._render(result);
        } catch {
            this._isGitRepo = false;
            this._showEmpty();
        }
    }

    _render({ branch, status, log }) {
        // Branch
        const branchEl = this._headerEl.querySelector('.git-branch');
        branchEl.textContent = branch || 'detached';

        let html = '';

        // Parse status
        const statusLines = status.trim().split('\n').filter(Boolean);
        if (statusLines.length > 0) {
            const staged = [];
            const unstaged = [];
            const untracked = [];

            for (const line of statusLines) {
                const x = line[0]; // index status
                const y = line[1]; // worktree status
                const file = line.substring(3);

                if (x === '?' && y === '?') {
                    untracked.push(file);
                } else {
                    if (x !== ' ' && x !== '?') staged.push({ status: x, file });
                    if (y !== ' ' && y !== '?') unstaged.push({ status: y, file });
                }
            }

            if (staged.length > 0) {
                html += '<div class="git-section"><h4 class="git-section-title staged">STAGED</h4>';
                html += '<div class="git-file-list">';
                for (const { status: s, file } of staged) {
                    html += `<div class="git-file staged"><span class="git-file-status">${window._escapeHtml(s)}</span><span class="git-file-name">${window._escapeHtml(file)}</span></div>`;
                }
                html += '</div></div>';
            }

            if (unstaged.length > 0) {
                html += '<div class="git-section"><h4 class="git-section-title modified">MODIFIED</h4>';
                html += '<div class="git-file-list">';
                for (const { status: s, file } of unstaged) {
                    html += `<div class="git-file modified"><span class="git-file-status">${window._escapeHtml(s)}</span><span class="git-file-name">${window._escapeHtml(file)}</span></div>`;
                }
                html += '</div></div>';
            }

            if (untracked.length > 0) {
                html += '<div class="git-section"><h4 class="git-section-title untracked">UNTRACKED</h4>';
                html += '<div class="git-file-list">';
                for (const file of untracked) {
                    html += `<div class="git-file untracked"><span class="git-file-status">?</span><span class="git-file-name">${window._escapeHtml(file)}</span></div>`;
                }
                html += '</div></div>';
            }
        } else {
            html += '<div class="git-section"><div class="git-clean">Working tree clean</div></div>';
        }

        // Recent commits
        const logLines = log.trim().split('\n').filter(Boolean);
        if (logLines.length > 0) {
            html += '<div class="git-section"><h4 class="git-section-title log">RECENT COMMITS</h4>';
            html += '<div class="git-log-list">';
            for (const line of logLines.slice(0, 10)) {
                const hash = line.substring(0, 7);
                const msg = line.substring(8);
                html += `<div class="git-log-entry"><span class="git-hash">${window._escapeHtml(hash)}</span><span class="git-msg">${window._escapeHtml(msg)}</span></div>`;
            }
            html += '</div></div>';
        }

        this._contentEl.innerHTML = html;
    }

    destroy() {
        this._unsubs.forEach(fn => fn());
        this._unsubs = [];
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }
}
