/**
 * BottomPanel - Toggleable bottom panel with extensible tabbed views.
 *
 * Each "view" is a split pane (left + right) registered via registerView().
 * Views are lazily created on first activation.
 *
 * Usage:
 *   const panel = new BottomPanel({ containerId: 'bottom_panel', store });
 *   panel.registerView('files', {
 *     label: 'FILES',
 *     create: ({ left, right }) => ({
 *       left: new FilesystemDisplay({ parentId: left.id }),
 *       right: new FilePreview({ parentId: right.id })
 *     })
 *   });
 *   panel.toggle(); // open/close
 */
export class BottomPanel {
    constructor({ containerId, store }) {
        this._views = new Map();
        this._activeView = null;
        this._isOpen = false;
        this._store = store || null;
        this._unsubs = [];
        this._container = document.getElementById(containerId);
        if (!this._container) throw new Error(`BottomPanel: #${containerId} not found`);

        this._headerEl = null;
        this._contentEl = null;
        this._tabsEl = null;
        this._toggleEl = null;

        this._createDOM();
    }

    /** Register a new view. create({ left, right }) is called lazily on first activation. */
    registerView(id, { label, create }) {
        this._views.set(id, { label, create, instance: null, element: null });
        this._updateTabs();
        if (!this._activeView) {
            this._activeView = id;
            this._updateTabs();
        }
    }

    toggle() {
        if (this._isOpen) this.close(); else this.open();
    }

    open(viewId) {
        this._isOpen = true;
        if (viewId && this._views.has(viewId)) this._activeView = viewId;
        this._container.classList.remove('collapsed');
        this._container.classList.add('expanded');
        this._ensureViewCreated(this._activeView);
        this._showActiveView();
        this._updateTabs();
        if (this._store) {
            this._store.set('bottomPanel.open', true);
            this._store.set('bottomPanel.activeView', this._activeView);
        }
    }

    close() {
        this._isOpen = false;
        this._container.classList.remove('expanded');
        this._container.classList.add('collapsed');
        this._updateTabs();
        if (this._store) {
            this._store.set('bottomPanel.open', false);
        }
    }

    get isOpen() { return this._isOpen; }
    get activeView() { return this._activeView; }

    switchView(id) {
        if (!this._views.has(id) || id === this._activeView) return;
        this._activeView = id;
        this._ensureViewCreated(id);
        this._showActiveView();
        this._updateTabs();
        if (this._store) {
            this._store.set('bottomPanel.activeView', id);
        }
    }

    _createDOM() {
        // Header bar (always visible)
        this._headerEl = document.createElement('div');
        this._headerEl.id = 'bottom_panel_header';

        this._tabsEl = document.createElement('div');
        this._tabsEl.id = 'bottom_panel_tabs';
        this._headerEl.appendChild(this._tabsEl);

        this._toggleEl = document.createElement('div');
        this._toggleEl.id = 'bottom_panel_toggle';
        this._toggleEl.textContent = '\u25B2'; // ▲
        this._toggleEl.addEventListener('click', () => this.toggle());
        this._headerEl.appendChild(this._toggleEl);

        this._container.appendChild(this._headerEl);

        // Content area (collapsible)
        this._contentEl = document.createElement('div');
        this._contentEl.id = 'bottom_panel_content';
        this._container.appendChild(this._contentEl);

        // Start collapsed
        this._container.classList.add('collapsed');
    }

    _updateTabs() {
        this._tabsEl.innerHTML = '';
        for (const [id, view] of this._views) {
            const tab = document.createElement('div');
            tab.className = `bottom-tab${id === this._activeView && this._isOpen ? ' active' : ''}`;
            tab.textContent = view.label;
            tab.addEventListener('click', () => {
                if (!this._isOpen) {
                    this.open(id);
                } else if (id !== this._activeView) {
                    this.switchView(id);
                } else {
                    this.close();
                }
            });
            this._tabsEl.appendChild(tab);
        }
    }

    _ensureViewCreated(id) {
        const view = this._views.get(id);
        if (!view || view.instance) return;

        const el = document.createElement('div');
        el.className = 'bottom-view';
        el.dataset.view = id;

        const leftPane = document.createElement('div');
        leftPane.className = 'view-pane view-left';
        leftPane.id = `bottom_view_${id}_left`;
        el.appendChild(leftPane);

        const rightPane = document.createElement('div');
        rightPane.className = 'view-pane view-right';
        rightPane.id = `bottom_view_${id}_right`;
        el.appendChild(rightPane);

        this._contentEl.appendChild(el);
        view.element = el;

        try {
            view.instance = view.create({ left: leftPane, right: rightPane });
        } catch (err) {
            console.error(`BottomPanel: failed to create view "${id}":`, err);
            leftPane.textContent = `Error loading view: ${err.message}`;
        }
    }

    _showActiveView() {
        for (const [viewId, view] of this._views) {
            if (view.element) {
                view.element.style.display = viewId === this._activeView ? 'flex' : 'none';
            }
        }
    }

    /** Get a view's instance by id */
    getView(id) {
        const view = this._views.get(id);
        return view ? view.instance : null;
    }

    destroy() {
        this._unsubs.forEach(fn => fn());
        this._unsubs = [];
        for (const [, view] of this._views) {
            if (view.instance) {
                // Destroy left/right components if they have destroy methods
                if (view.instance.left && typeof view.instance.left.destroy === 'function') {
                    view.instance.left.destroy();
                }
                if (view.instance.right && typeof view.instance.right.destroy === 'function') {
                    view.instance.right.destroy();
                }
                if (typeof view.instance.destroy === 'function') {
                    view.instance.destroy();
                }
            }
        }
        this._views.clear();
    }
}
