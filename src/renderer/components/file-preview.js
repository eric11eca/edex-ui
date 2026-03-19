/**
 * FilePreview - Displays syntax-highlighted file content in the bottom panel.
 *
 * Subscribes to store 'filePreview.path' events. When a file path is set,
 * reads and displays the file content with line numbers.
 */
export class FilePreview {
    constructor(parentId, { store } = {}) {
        this._store = store || null;
        this._unsubs = [];
        this._currentPath = null;
        this._maxFileSize = 512 * 1024; // 512KB max preview
        this._maxLines = 500;

        this.parent = typeof parentId === 'string'
            ? document.getElementById(parentId)
            : parentId;

        this._createDOM();

        if (this._store) {
            this._unsubs.push(
                this._store.on('filePreview.path', (path) => {
                    if (path) this.loadFile(path);
                })
            );
        }
    }

    _createDOM() {
        this.parent.innerHTML = '';

        // Header
        this._headerEl = document.createElement('div');
        this._headerEl.className = 'file-preview-header';
        this._headerEl.innerHTML = '<span class="file-preview-title">FILE PREVIEW</span><span class="file-preview-path"></span>';
        this.parent.appendChild(this._headerEl);

        // Content area
        this._contentEl = document.createElement('div');
        this._contentEl.className = 'file-preview-content';
        this.parent.appendChild(this._contentEl);

        // Empty state
        this._showEmpty();
    }

    _showEmpty() {
        this._contentEl.innerHTML = '<div class="file-preview-empty">Select a file to preview</div>';
    }

    async loadFile(filePath) {
        if (!filePath || filePath === this._currentPath) return;
        this._currentPath = filePath;

        const pathEl = this._headerEl.querySelector('.file-preview-path');
        const basename = filePath.split(/[/\\]/).pop();
        pathEl.textContent = basename;
        pathEl.title = filePath;

        try {
            // Check if file exists
            const exists = await window.edex.fs.exists(filePath);
            if (!exists) {
                this._contentEl.innerHTML = '<div class="file-preview-empty">File not found</div>';
                return;
            }

            // Read file content
            const content = await window.edex.fs.readFile(filePath, 'utf-8');

            if (content.length > this._maxFileSize) {
                this._contentEl.innerHTML = '<div class="file-preview-empty">File too large to preview</div>';
                return;
            }

            this._renderContent(content, basename);
        } catch (err) {
            // Binary file or read error
            this._contentEl.innerHTML = `<div class="file-preview-empty">Cannot preview: ${window._escapeHtml(err.message || String(err))}</div>`;
        }
    }

    _renderContent(content, filename) {
        const lines = content.split('\n');
        const displayLines = lines.slice(0, this._maxLines);
        const truncated = lines.length > this._maxLines;

        // Detect language for basic syntax class
        const ext = (filename.match(/\.(\w+)$/) || [])[1] || '';
        const langClass = this._getLangClass(ext);

        // Build line-numbered content
        const gutterWidth = String(displayLines.length).length;
        let html = '<table class="file-preview-table"><tbody>';
        for (let i = 0; i < displayLines.length; i++) {
            const lineNum = String(i + 1).padStart(gutterWidth, ' ');
            const lineContent = window._escapeHtml(displayLines[i]) || ' ';
            html += `<tr><td class="line-num">${lineNum}</td><td class="line-content ${langClass}">${this._highlightLine(lineContent, ext)}</td></tr>`;
        }
        if (truncated) {
            html += `<tr><td class="line-num">...</td><td class="line-content">[${lines.length - this._maxLines} more lines]</td></tr>`;
        }
        html += '</tbody></table>';

        this._contentEl.innerHTML = html;
        this._contentEl.scrollTop = 0;
    }

    /** Basic syntax highlighting by token type.
     *  Tokenizes first to avoid double-nesting spans. */
    _highlightLine(escapedLine, ext) {
        // Split into tokens: strings, comments, and code segments
        // Process strings and comments first (they take priority), then highlight code segments
        const tokens = [];
        let remaining = escapedLine;

        // Extract string literals first
        const stringRe = /(&quot;.*?&quot;|&#039;.*?&#039;)/;
        // Determine comment pattern
        let commentRe = null;
        if (['js', 'ts', 'jsx', 'tsx', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'swift', 'css', 'scss'].includes(ext)) {
            commentRe = /(\/\/.*)/;
        } else if (['py', 'rb', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'conf'].includes(ext)) {
            commentRe = /(#.*)/;
        }

        // Simple two-pass: first handle comments (they consume rest of line), then strings in code parts
        // Check for comment
        let commentStart = -1;
        if (commentRe) {
            const cm = remaining.match(commentRe);
            if (cm) commentStart = cm.index;
        }

        const codePart = commentStart >= 0 ? remaining.substring(0, commentStart) : remaining;
        const commentPart = commentStart >= 0 ? remaining.substring(commentStart) : '';

        // Highlight code part (split by strings)
        let codeRemaining = codePart;
        let result = '';
        while (codeRemaining) {
            const sm = codeRemaining.match(stringRe);
            if (!sm) {
                result += this._highlightCode(codeRemaining, ext);
                break;
            }
            result += this._highlightCode(codeRemaining.substring(0, sm.index), ext);
            result += `<span class="hl-string">${sm[1]}</span>`;
            codeRemaining = codeRemaining.substring(sm.index + sm[0].length);
        }

        if (commentPart) {
            result += `<span class="hl-comment">${commentPart}</span>`;
        }

        return result;
    }

    /** Highlight keywords and numbers in a code segment (no strings or comments) */
    _highlightCode(segment, ext) {
        let line = segment;
        if (['js', 'ts', 'jsx', 'tsx'].includes(ext)) {
            line = line.replace(/\b(const|let|var|function|class|import|export|from|return|if|else|for|while|async|await|new|this|throw|try|catch|default|switch|case|break|continue|typeof|instanceof)\b/g,
                '<span class="hl-keyword">$1</span>');
        }
        if (['py'].includes(ext)) {
            line = line.replace(/\b(def|class|import|from|return|if|elif|else|for|while|async|await|with|as|try|except|raise|yield|lambda|pass|break|continue|and|or|not|in|is|None|True|False)\b/g,
                '<span class="hl-keyword">$1</span>');
        }
        line = line.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');
        return line;
    }

    _getLangClass(ext) {
        const langMap = {
            js: 'lang-js', ts: 'lang-js', jsx: 'lang-js', tsx: 'lang-js',
            py: 'lang-py', rb: 'lang-py',
            sh: 'lang-sh', bash: 'lang-sh', zsh: 'lang-sh',
            json: 'lang-json', yaml: 'lang-json', yml: 'lang-json', toml: 'lang-json',
            md: 'lang-md', txt: 'lang-txt',
            css: 'lang-css', scss: 'lang-css', less: 'lang-css',
            html: 'lang-html', xml: 'lang-html', svg: 'lang-html',
            c: 'lang-c', cpp: 'lang-c', h: 'lang-c',
            go: 'lang-go', rs: 'lang-rs', java: 'lang-java',
        };
        return langMap[ext] || 'lang-txt';
    }

    clear() {
        this._currentPath = null;
        this._showEmpty();
    }

    destroy() {
        this._unsubs.forEach(fn => fn());
        this._unsubs = [];
    }
}
