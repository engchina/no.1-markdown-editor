// Line-ending (EOL) handling for documents.
//
// CodeMirror normalizes every document to LF internally (it strips `\r` when it
// splits on `/\r\n?|\n/`), so the in-memory `content` we keep on a tab is always
// LF. Windows files, however, commonly use CRLF — saving them back as LF would
// silently rewrite every line and produce noisy diffs. We therefore remember the
// original EOL style per tab and restore it at the disk-write boundary, while
// keeping LF as the single in-memory canonical form.

export type EolStyle = '\n' | '\r\n'

/**
 * Removes a single leading UTF-8 BOM (U+FEFF). Some Windows tooling prefixes
 * text files with it; left in place it shows as an invisible character and
 * breaks front-matter / heading detection. The Rust `read_file` command strips
 * it too, but document content also reaches the store via the fs plugin and
 * drag-and-drop, so we normalize defensively at the in-memory boundary as well.
 */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** Detects the dominant EOL of freshly read disk content. */
export function detectEol(raw: string): EolStyle {
  return raw.includes('\r\n') ? '\r\n' : '\n'
}

/** Normalizes CRLF / lone CR to LF so in-memory comparisons are EOL-insensitive. */
export function toLf(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/**
 * Re-applies an EOL style to LF-normalized content right before writing to disk.
 * The input MUST already be LF (the in-memory canonical form); applying CRLF to
 * content that still contains `\r\n` would double the carriage returns.
 */
export function applyEol(lf: string, eol: EolStyle): string {
  return eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf
}
