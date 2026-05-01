const RAW_HTML_PATTERN =
  /<!--|<!\[CDATA\[|<![A-Za-z]|<\?[A-Za-z]|<\/[A-Za-z][\w:-]*\s*>|<[A-Za-z][\w:-]*(?:\s(?:[^<>"']+|"[^"]*"|'[^']*')*)?\s*\/?>/gm

export function containsLikelyRawHtml(markdown: string): boolean {
  if (!markdown) return false

  RAW_HTML_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = RAW_HTML_PATTERN.exec(markdown)) !== null) {
    if (!hasOddTrailingBackslashes(markdown, match.index)) return true
  }

  return false
}

function hasOddTrailingBackslashes(value: string, endIndex: number): boolean {
  let count = 0
  for (let index = endIndex - 1; index >= 0 && value[index] === '\\'; index -= 1) {
    count += 1
  }

  return count % 2 === 1
}
