export interface MarkdownInsertionPlan {
  text: string
  selectionOffset: number
}

export function prepareMarkdownInsertion(
  markdownText: string,
  followingText = ''
): MarkdownInsertionPlan {
  void followingText

  if (!markdownText) {
    return {
      text: markdownText,
      selectionOffset: 0,
    }
  }

  return {
    text: markdownText,
    selectionOffset: markdownText.length,
  }
}
