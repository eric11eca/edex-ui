/**
 * EdexStore - Lightweight reactive state container
 *
 * EventTarget-based store that holds application state and emits
 * typed events on changes. Components subscribe to specific state
 * paths and receive updates when those paths change.
 *
 * Usage:
 *   const store = new EdexStore({ settings: {...}, theme: {...} });
 *   const unsub = store.on('settings.clockHours', (newVal) => { ... });
 *   store.set('settings.clockHours', 12);
 *   unsub(); // cleanup
 */
export class EdexStore extends EventTarget {
  constructor(initialState = {}) {
    super();
    this._state = structuredClone(initialState);
  }

  /** Read current state (returns reference - treat as read-only) */
  get state() {
    return this._state;
  }

  /**
   * Get a value by dot-delimited path.
   * @param {string} path - e.g. "network.offline", "settings.clockHours"
   * @returns {*}
   */
  get(path) {
    return path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : undefined, this._state);
  }

  /**
   * Set a value at a dot-delimited path.
   * Emits "change:<path>" event with { detail: { value, previousValue } }
   * Also emits on parent paths (e.g. setting "network.offline" also emits "change:network")
   * @param {string} path
   * @param {*} value
   */
  set(path, value) {
    const prev = this.get(path);

    // Set value at path
    const keys = path.split('.');
    let obj = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === undefined) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;

    // Emit change event for the exact path
    this.dispatchEvent(new CustomEvent(`change:${path}`, {
      detail: { value, previousValue: prev }
    }));

    // Emit change event for parent paths (bubble up)
    for (let i = keys.length - 1; i > 0; i--) {
      const parentPath = keys.slice(0, i).join('.');
      this.dispatchEvent(new CustomEvent(`change:${parentPath}`, {
        detail: { value: this.get(parentPath), previousValue: undefined }
      }));
    }
  }

  /**
   * Subscribe to state changes at a given path.
   * @param {string} path - e.g. "network.offline", "systemData.currentLoad"
   * @param {function} callback - (newValue, previousValue) => void
   * @returns {function} unsubscribe function
   */
  on(path, callback) {
    const handler = (e) => callback(e.detail.value, e.detail.previousValue);
    this.addEventListener(`change:${path}`, handler);
    return () => this.removeEventListener(`change:${path}`, handler);
  }

  /**
   * Batch multiple set() calls, emitting events only once per affected path.
   * @param {function} fn - callback that calls set() multiple times
   */
  batch(fn) {
    const pending = new Map();
    const origDispatch = this.dispatchEvent.bind(this);

    // Intercept dispatches and collect them
    this.dispatchEvent = (event) => {
      pending.set(event.type, event);
    };

    fn();

    // Restore and flush
    this.dispatchEvent = origDispatch;
    for (const event of pending.values()) {
      origDispatch(event);
    }
  }

  destroy() {
    // EventTarget doesn't have a built-in removeAll, but GC handles it
    // when the store is dereferenced
  }
}
