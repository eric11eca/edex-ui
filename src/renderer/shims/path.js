// Minimal path shim for browser context (used by mime-types)
export function extname(p) {
  const i = p.lastIndexOf('.');
  if (i < 1) return '';
  return p.slice(i);
}

export function join(...segments) {
  return segments.join('/').replace(/\/+/g, '/');
}

export function resolve(...segments) {
  return segments.join('/').replace(/\/+/g, '/');
}

export function basename(p, ext) {
  let base = p.split('/').pop() || '';
  if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
  return base;
}

export function dirname(p) {
  const parts = p.split('/');
  parts.pop();
  return parts.join('/') || '.';
}

export const sep = '/';

export default { extname, join, resolve, basename, dirname, sep };
