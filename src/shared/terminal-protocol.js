// Terminal IPC protocol message types
// Used by both main (pty-manager.js) and renderer (terminal.class.js)

export const TerminalMessage = Object.freeze({
  // Renderer → Main
  RENDERER_STARTUP: 'Renderer startup',
  RESIZE: 'Resize',

  // Main → Renderer
  NEW_CWD: 'New cwd',
  FALLBACK_CWD: 'Fallback cwd',
  NEW_PROCESS: 'New process',
});

/**
 * Build the IPC channel name for a given port.
 * @param {number} port
 * @returns {string}
 */
export function terminalChannel(port) {
  return `terminal_channel-${port}`;
}
