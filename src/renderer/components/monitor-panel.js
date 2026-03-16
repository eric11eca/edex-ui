/**
 * MonitorPanel - Base class for all monitor panel components.
 *
 * Provides a standard lifecycle for panels that display in the side columns:
 *   constructor → _createDOM() → _subscribe() or _startPolling() → destroy()
 *
 * Subclasses must override:
 *   - _createDOM()    — build this._element, append to this.parent
 *   - _subscribe()    — register store.on() subscriptions (push unsubs to this._unsubs)
 *   - _startPolling() — start setInterval-based polling (store handles for _stopPolling)
 *
 * Optional overrides:
 *   - _stopPolling()  — clear interval handles (called by destroy())
 *   - destroy()       — additional cleanup (call super.destroy())
 *
 * Usage for user plugins:
 *   export default class MyPanel extends MonitorPanel {
 *     static id = 'my_panel';
 *     static title = 'My Panel';
 *
 *     _createDOM() { ... }
 *     _subscribe() { ... }
 *   }
 */
export class MonitorPanel {
    /**
     * @param {string} parentId - DOM id of the parent column element
     * @param {object} [options]
     * @param {import('../store/index.js').EdexStore} [options.store] - Centralized state store
     */
    constructor(parentId, { store } = {}) {
        if (!parentId) throw new Error("MonitorPanel: missing parentId");

        this._store = store || null;
        this._unsubs = [];
        this._intervals = [];
        this._timeouts = [];

        this.parent = document.getElementById(parentId);
        if (!this.parent) throw new Error(`MonitorPanel: element #${parentId} not found`);

        this._createDOM();

        if (this._store) {
            this._subscribe();
        } else {
            this._startPolling();
        }
    }

    /** Build the panel DOM and append to this.parent. Override in subclass. */
    _createDOM() {
        // Subclass must implement
    }

    /** Register store subscriptions. Override in subclass. */
    _subscribe() {
        // Subclass registers store.on() calls here
    }

    /** Start interval-based polling (legacy/fallback). Override in subclass. */
    _startPolling() {
        // Subclass starts setInterval here
    }

    /** Clear all interval handles. Override for custom cleanup. */
    _stopPolling() {
        this._intervals.forEach(id => clearInterval(id));
        this._intervals = [];
        this._timeouts.forEach(id => clearTimeout(id));
        this._timeouts = [];
    }

    /** Helper: register an interval that auto-clears on destroy */
    _setInterval(fn, ms) {
        const id = setInterval(fn, ms);
        this._intervals.push(id);
        return id;
    }

    /** Helper: register a timeout that auto-clears on destroy */
    _setTimeout(fn, ms) {
        const id = setTimeout(fn, ms);
        this._timeouts.push(id);
        return id;
    }

    /** Teardown: clears intervals, timeouts, and store subscriptions */
    destroy() {
        this._stopPolling();
        this._unsubs.forEach(fn => fn());
        this._unsubs = [];
    }
}
