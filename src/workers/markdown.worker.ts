/// <reference lib="webworker" />

import type { MarkdownRenderRequest, MarkdownRenderResponse } from './markdownMessages'
import { containsLikelyMath } from '../lib/markdownMath.ts'

declare const self: DedicatedWorkerGlobalScope

let markdownRendererPromise: Promise<typeof import('../lib/markdownWorker')> | null = null

async function loadMarkdownRenderer() {
  markdownRendererPromise ??= import('../lib/markdownWorker').catch((error) => {
    markdownRendererPromise = null
    throw error
  })

  return markdownRendererPromise
}

self.onmessage = async (event: MessageEvent<MarkdownRenderRequest>) => {
  const { id, markdown, syntaxHighlightEngine } = event.data

  // rehype-katex pulls in hast-util-from-html-isomorphic, which evaluates
  // `new DOMParser()` at module load. DOMParser is unavailable in Web Workers,
  // so let the host render math documents on the main thread instead.
  if (containsLikelyMath(markdown)) {
    const response: MarkdownRenderResponse = { id, requiresMainThread: true }
    self.postMessage(response)
    return
  }

  try {
    const { renderMarkdownInWorker } = await loadMarkdownRenderer()
    const html = await renderMarkdownInWorker(markdown, syntaxHighlightEngine)
    const response: MarkdownRenderResponse = { id, html }
    self.postMessage(response)
  } catch (error) {
    const response: MarkdownRenderResponse = {
      id,
      error: error instanceof Error ? error.message : 'Unknown markdown rendering error',
    }
    self.postMessage(response)
  }
}

export {}
