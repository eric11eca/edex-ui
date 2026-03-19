/**
 * ProcessManager - Displays detailed system process information in the bottom panel.
 *
 * Shows top processes sorted by CPU or memory usage, with more detail than
 * the sidebar toplist widget. Uses systeminformation data from the store.
 */
export class ProcessManager {
    constructor(parentId, { store } = {}) {
        this._store = store || null;
        this._unsubs = [];
        this._sortBy = 'cpu'; // 'cpu' or 'mem'
        this._maxProcesses = 25;
        this._processes = [];

        this.parent = typeof parentId === 'string'
            ? document.getElementById(parentId)
            : parentId;

        this._createDOM();

        if (this._store) {
            this._unsubs.push(
                this._store.on('systemData.processes', (data) => {
                    if (data) this._update(data);
                })
            );
        }
    }

    _createDOM() {
        this.parent.innerHTML = '';

        // Header with sort controls
        this._headerEl = document.createElement('div');
        this._headerEl.className = 'proc-header';
        this._headerEl.innerHTML = `
            <span class="proc-title">PROCESSES</span>
            <div class="proc-sort-controls">
                <span class="proc-sort-btn active" data-sort="cpu">CPU</span>
                <span class="proc-sort-btn" data-sort="mem">MEM</span>
            </div>`;
        this.parent.appendChild(this._headerEl);

        // Sort button handlers
        this._headerEl.querySelectorAll('.proc-sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._sortBy = btn.dataset.sort;
                this._headerEl.querySelectorAll('.proc-sort-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._render();
            });
        });

        // Table
        this._tableEl = document.createElement('div');
        this._tableEl.className = 'proc-table';
        this.parent.appendChild(this._tableEl);

        this._showEmpty();
    }

    _showEmpty() {
        this._tableEl.innerHTML = '<div class="proc-empty">Waiting for process data...</div>';
    }

    _update(data) {
        if (!data || !data.list) return;
        this._processes = data.list;
        this._render();
    }

    _render() {
        if (!this._processes || this._processes.length === 0) {
            this._showEmpty();
            return;
        }

        // Sort processes
        const sorted = [...this._processes].sort((a, b) => {
            if (this._sortBy === 'cpu') return (b.cpu || 0) - (a.cpu || 0);
            return (b.mem || 0) - (a.mem || 0);
        });

        const display = sorted.slice(0, this._maxProcesses);

        let html = `<table class="proc-list">
            <thead><tr>
                <th class="proc-col-pid">PID</th>
                <th class="proc-col-name">NAME</th>
                <th class="proc-col-cpu">CPU %</th>
                <th class="proc-col-mem">MEM %</th>
                <th class="proc-col-user">USER</th>
            </tr></thead><tbody>`;

        for (const proc of display) {
            const cpuVal = (proc.cpu || 0).toFixed(1);
            const memVal = (proc.mem || 0).toFixed(1);
            const cpuClass = proc.cpu > 50 ? 'proc-high' : proc.cpu > 20 ? 'proc-medium' : '';
            const memClass = proc.mem > 50 ? 'proc-high' : proc.mem > 20 ? 'proc-medium' : '';

            html += `<tr>
                <td class="proc-col-pid">${proc.pid || ''}</td>
                <td class="proc-col-name" title="${window._escapeHtml(proc.command || proc.name || '')}">${window._escapeHtml(proc.name || '')}</td>
                <td class="proc-col-cpu ${cpuClass}">${cpuVal}</td>
                <td class="proc-col-mem ${memClass}">${memVal}</td>
                <td class="proc-col-user">${window._escapeHtml(proc.user || '')}</td>
            </tr>`;
        }

        html += '</tbody></table>';
        this._tableEl.innerHTML = html;
    }

    destroy() {
        this._unsubs.forEach(fn => fn());
        this._unsubs = [];
    }
}
