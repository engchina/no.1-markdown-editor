// Internal sourcepos markers attached by the markdown render pipeline so the
// preview can align scroll position with the editor (see remarkSourceLine,
// rehypeSourceLineFromPosition, rehypeWrapMathPreForSourceLine). These markers
// are useful only inside the live preview DOM. Strip them when the rendered
// HTML crosses an external boundary — clipboard, paste-back conversion,
// standalone export — so other tools never see our internal metadata.

const SOURCE_LINE_ATTR_PATTERN = / data-source-line="[^"]*"/g
const MATH_WRAPPER_PATTERN =
  /<div class="math-source-line-wrap" data-source-line="\d+">(<span class="katex-display">[\s\S]*?<\/span>)<\/div>/g

export function stripSourceLineMarkers(html: string): string {
  if (!html) return html
  return html.replace(MATH_WRAPPER_PATTERN, '$1').replace(SOURCE_LINE_ATTR_PATTERN, '')
}
