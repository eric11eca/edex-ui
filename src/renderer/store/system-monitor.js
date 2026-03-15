/**
 * SystemMonitorScheduler - Coordinated system information polling
 *
 * Replaces 13+ independent setInterval calls with 3 coordinated tiers:
 * - Fast (1s):   currentLoad, mem
 * - Medium (3s): networkInterfaces, cpuTemperature, networkStats, networkConnections
 * - Slow (10s):  cpu, processes, battery, fsSize, system, chassis
 *
 * Adaptive: if a tier's batch takes >500ms, the next interval doubles.
 * Uses setTimeout (not setInterval) so ticks don't pile up under load.
 */
export class SystemMonitorScheduler {
  /**
   * @param {import('./index.js').EdexStore} store - writes data into store.systemData.*
   * @param {object} si - the window.edex.si proxy
   */
  constructor(store, si) {
    this._store = store;
    this._si = si;
    this._timers = { fast: null, medium: null, slow: null };
    this._running = false;
  }

  /** Start all tiers */
  start() {
    this._running = true;
    this._runFastTier();
    this._runMediumTier();
    this._runSlowTier();
  }

  /** Stop all tiers */
  stop() {
    this._running = false;
    if (this._timers.fast) clearTimeout(this._timers.fast);
    if (this._timers.medium) clearTimeout(this._timers.medium);
    if (this._timers.slow) clearTimeout(this._timers.slow);
    this._timers = { fast: null, medium: null, slow: null };
  }

  async _runFastTier() {
    if (!this._running) return;
    const start = performance.now();

    try {
      const [currentLoad, mem] = await Promise.all([
        this._si.currentLoad(),
        this._si.mem(),
      ]);
      this._store.batch(() => {
        this._store.set('systemData.currentLoad', currentLoad);
        this._store.set('systemData.mem', mem);
      });
    } catch (e) {
      console.warn('SystemMonitor fast tier error:', e);
    }

    const elapsed = performance.now() - start;
    const nextInterval = elapsed > 500 ? Math.min(elapsed * 2, 5000) : 1000;
    this._timers.fast = setTimeout(() => this._runFastTier(), nextInterval);
  }

  async _runMediumTier() {
    if (!this._running) return;
    const start = performance.now();

    try {
      const iface = this._store.get('network.iface');

      const calls = [
        this._si.networkInterfaces(),
        this._si.cpuTemperature(),
      ];
      if (iface) {
        calls.push(this._si.networkStats(iface));
        calls.push(this._si.networkConnections());
      } else {
        calls.push(Promise.resolve(null));
        calls.push(Promise.resolve(null));
      }

      const [networkInterfaces, cpuTemperature, networkStats, networkConnections] = await Promise.all(calls);

      this._store.batch(() => {
        this._store.set('systemData.networkInterfaces', networkInterfaces);
        this._store.set('systemData.cpuTemperature', cpuTemperature);
        if (networkStats) this._store.set('systemData.networkStats', networkStats);
        if (networkConnections) this._store.set('systemData.networkConnections', networkConnections);
      });
    } catch (e) {
      console.warn('SystemMonitor medium tier error:', e);
    }

    const elapsed = performance.now() - start;
    const nextInterval = elapsed > 500 ? Math.min(elapsed * 2, 15000) : 3000;
    this._timers.medium = setTimeout(() => this._runMediumTier(), nextInterval);
  }

  async _runSlowTier() {
    if (!this._running) return;
    const start = performance.now();

    try {
      const [cpu, processes, battery, fsSize, system, chassis] = await Promise.all([
        this._si.cpu(),
        this._si.processes(),
        this._si.battery(),
        this._si.fsSize(),
        this._si.system(),
        this._si.chassis(),
      ]);

      this._store.batch(() => {
        this._store.set('systemData.cpu', cpu);
        this._store.set('systemData.processes', processes);
        this._store.set('systemData.battery', battery);
        this._store.set('systemData.fsSize', fsSize);
        this._store.set('systemData.system', system);
        this._store.set('systemData.chassis', chassis);
      });
    } catch (e) {
      console.warn('SystemMonitor slow tier error:', e);
    }

    const elapsed = performance.now() - start;
    const nextInterval = elapsed > 500 ? Math.min(elapsed * 2, 30000) : 10000;
    this._timers.slow = setTimeout(() => this._runSlowTier(), nextInterval);
  }

  destroy() {
    this.stop();
  }
}
