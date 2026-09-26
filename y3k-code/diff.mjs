// Diffs, in one shape everywhere: hunks of `{oldStart, oldLines, newStart,
// newLines, lines: [' ctx', '-removed', '+added']}` — the shape Claude Code
// itself reports as structuredPatch, so its diffs pass straight through and
// every other source (a git patch, a proposed edit) is converted into it.
//
// A proposed edit is diffed BEFORE the person is asked to allow it, so the
// permission card always shows the change first.

import { readFileSync } from 'node:fs';

const CONTEXT = 3;
const MAX_CELLS = 4_000_000; // lines(a) × lines(b) beyond this: show a whole-file replace

function splitLines(s) {
  if (s === '' || s == null) return [];
  const lines = String(s).split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Longest-common-subsequence edit script over lines: [{op:' '|'-'|'+', line}].
function script(a, b) {
  const n = a.length;
  const m = b.length;
  // Trim the common head and tail first — most edits touch a few lines of a
  // large file, and this keeps the table small.
  let head = 0;
  while (head < n && head < m && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < n - head && tail < m - head && a[n - 1 - tail] === b[m - 1 - tail]) tail++;
  const A = a.slice(head, n - tail);
  const B = b.slice(head, m - tail);
  const out = a.slice(0, head).map((line) => ({ op: ' ', line }));
  if (A.length * B.length > MAX_CELLS) {
    for (const line of A) out.push({ op: '-', line });
    for (const line of B) out.push({ op: '+', line });
  } else {
    const w = B.length + 1;
    const L = new Uint32Array((A.length + 1) * w);
    for (let i = A.length - 1; i >= 0; i--) {
      for (let j = B.length - 1; j >= 0; j--) {
        L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < A.length && j < B.length) {
      if (A[i] === B[j]) { out.push({ op: ' ', line: A[i] }); i++; j++; }
      else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) out.push({ op: '-', line: A[i++] });
      else out.push({ op: '+', line: B[j++] });
    }
    while (i < A.length) out.push({ op: '-', line: A[i++] });
    while (j < B.length) out.push({ op: '+', line: B[j++] });
  }
  for (const line of a.slice(n - tail)) out.push({ op: ' ', line });
  return out;
}

// Group an edit script into hunks with CONTEXT lines around each change.
function toHunks(ops) {
  const hunks = [];
  let oldNo = 1;
  let newNo = 1;
  const pos = ops.map((o) => {
    const p = { ...o, oldNo, newNo };
    if (o.op !== '+') oldNo++;
    if (o.op !== '-') newNo++;
    return p;
  });
  let i = 0;
  while (i < pos.length) {
    if (pos[i].op === ' ') { i++; continue; }
    let start = Math.max(0, i - CONTEXT);
    let end = i;
    // extend while changes are within 2×CONTEXT of each other
    while (end < pos.length) {
      if (pos[end].op !== ' ') { end++; continue; }
      let k = end;
      while (k < pos.length && pos[k].op === ' ') k++;
      if (k < pos.length && k - end <= CONTEXT * 2) { end = k; continue; }
      end = Math.min(pos.length, end + CONTEXT);
      break;
    }
    const slice = pos.slice(start, end);
    const first = slice[0];
    hunks.push({
      oldStart: first.oldNo,
      oldLines: slice.filter((p) => p.op !== '+').length,
      newStart: first.newNo,
      newLines: slice.filter((p) => p.op !== '-').length,
      lines: slice.map((p) => p.op + p.line),
    });
    i = end;
  }
  return hunks;
}

export function lineDiff(before, after) {
  return toHunks(script(splitLines(before), splitLines(after)));
}

export function countChanges(hunks) {
  let added = 0;
  let removed = 0;
  for (const h of hunks || []) for (const l of h.lines || []) {
    if (l[0] === '+') added++;
    else if (l[0] === '-') removed++;
  }
  return { added, removed };
}

const readOr = (path, fallback) => { try { return readFileSync(path, 'utf8'); } catch { return fallback; } };

// What an Edit would change, computed from the file on disk. `null` when the
// text to replace is not there (the tool will fail and say so itself).
export function editPreview(path, oldString, newString, replaceAll = false) {
  const before = readOr(path, null);
  if (before == null || !oldString || !before.includes(oldString)) return null;
  const after = replaceAll ? before.split(oldString).join(newString) : before.replace(oldString, () => newString);
  const hunks = lineDiff(before, after);
  return { path, hunks, ...countChanges(hunks), created: false };
}

// What a Write would change: a diff against the current file, or all-new lines.
export function writePreview(path, content) {
  const before = readOr(path, null);
  const hunks = lineDiff(before ?? '', content ?? '');
  return { path, hunks, ...countChanges(hunks), created: before == null };
}

// Claude Code's own structuredPatch is already this shape; keep only the fields.
export function fromStructuredPatch(sp) {
  return (Array.isArray(sp) ? sp : []).map((h) => ({
    oldStart: h.oldStart | 0, oldLines: h.oldLines | 0, newStart: h.newStart | 0, newLines: h.newLines | 0,
    lines: Array.isArray(h.lines) ? h.lines.map(String) : [],
  }));
}

// A unified diff (git's) → [{path, hunks, added, removed}].
export function parseUnified(patch) {
  const files = [];
  let file = null;
  let hunk = null;
  for (const raw of String(patch || '').split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = raw.match(/^diff --git a\/(.*?) b\/(.*)$/);
      file = { path: m ? m[2] : raw.slice(11), hunks: [] };
      files.push(file);
      hunk = null;
      continue;
    }
    if (raw.startsWith('+++ ') && file && raw !== '+++ /dev/null') { file.path = raw.replace(/^\+\+\+ (b\/)?/, ''); continue; }
    if (raw.startsWith('--- ')) continue;
    const h = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (h) {
      if (!file) { file = { path: '', hunks: [] }; files.push(file); }
      hunk = { oldStart: +h[1], oldLines: h[2] == null ? 1 : +h[2], newStart: +h[3], newLines: h[4] == null ? 1 : +h[4], lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (hunk && (raw[0] === ' ' || raw[0] === '+' || raw[0] === '-')) hunk.lines.push(raw);
  }
  return files.map((f) => ({ ...f, ...countChanges(f.hunks) }));
}
