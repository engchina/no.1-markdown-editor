const RAW_HTML_PATTERN =
  /(?:^|[\r\n]|[^\w\\])(?:<!--|<!\[CDATA\[|<![A-Za-z]|<\?[A-Za-z]|<\/[A-Za-z][\w:-]*\s*>|<[A-Za-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>)/m
const RAW_HTML_BREAK_PATTERN = /<br\s*\/?>/i

export function containsLikelyRawHtml(markdown: string): boolean {
  if (!markdown) return false
  return RAW_HTML_BREAK_PATTERN.test(markdown) || RAW_HTML_PATTERN.test(markdown)
}
