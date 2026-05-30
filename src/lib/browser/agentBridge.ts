/**
 * Read channel between the host (main window) and an external browser webview.
 *
 * The Rust side injects `browser_bridge.js` into every browser webview. Calling
 * `collectPageContent(label)` triggers that bridge to build a snapshot of the
 * current page and stream it back — primarily through `document.title` chunks
 * (see `handle_browser_title_report` in `src-tauri/src/lib.rs`), which the host
 * reassembles and emits on `browser-agent-data-{label}`.
 *
 * The pure helpers (`makeRequestId`, `parseSnapshot`) are exported so the wiring
 * contract can be unit-tested without a Tauri host.
 */

export interface PageElement {
  /** Stable index also stamped onto the live DOM node (`data-agent-idx`). */
  idx: number
  /** ARIA-style role (link, button, textbox, …). */
  role: string
  /** Accessible name / visible label, truncated. */
  name: string
}

export interface PageSnapshot {
  url: string
  title: string
  /** Readable plain text of the main content region. */
  text: string
  /** Lightweight Markdown rendering of the main content region. */
  markdown: string
  /** Indexed interactive elements (for future agent act loop). */
  elements: PageElement[]
  /** Set when the bridge failed to build a snapshot. */
  error?: string
}

interface BrowserAgentDataEvent {
  requestId: string
  payload: string
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * Generate a collection request id. Must stay alphanumeric and <= 64 chars to
 * satisfy `is_safe_request_id` on the Rust side (it is embedded into an `eval`
 * string and used as the title-channel delimiter key).
 */
export function makeRequestId(): string {
  const raw = 'req' + Math.random().toString(36).slice(2) + Date.now().toString(36)
  return raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 64) || 'req0'
}

/** Parse the bridge's JSON payload into a normalized PageSnapshot. */
export function parseSnapshot(raw: string): PageSnapshot {
  const data = JSON.parse(raw) as Partial<PageSnapshot>
  return {
    url: typeof data.url === 'string' ? data.url : '',
    title: typeof data.title === 'string' ? data.title : '',
    text: typeof data.text === 'string' ? data.text : '',
    markdown: typeof data.markdown === 'string' ? data.markdown : '',
    elements: Array.isArray(data.elements) ? (data.elements as PageElement[]) : [],
    error: typeof data.error === 'string' ? data.error : undefined,
  }
}

export interface CollectPageContentOptions {
  timeoutMs?: number
}

/**
 * Trigger a snapshot collection in the given browser webview and resolve with
 * the parsed result. Rejects on timeout, transport error, or when not running
 * inside the Tauri desktop host.
 */
export async function collectPageContent(
  label: string,
  options: CollectPageContentOptions = {},
): Promise<PageSnapshot> {
  if (!isTauri) {
    throw new Error('Browser content collection requires the desktop app')
  }

  const timeoutMs = options.timeoutMs ?? 15000
  const requestId = makeRequestId()
  const eventName = `browser-agent-data-${label}`

  // Loaded dynamically (mirrors src/lib/ai/client.ts) so the pure helpers in
  // this module can be imported in non-Tauri test environments.
  const { invoke } = await import('@tauri-apps/api/core')
  const { listen } = await import('@tauri-apps/api/event')

  return new Promise<PageSnapshot>((resolve, reject) => {
    let settled = false
    let unlisten: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (unlisten) unlisten()
      fn()
    }

    void (async () => {
      try {
        unlisten = await listen<BrowserAgentDataEvent>(eventName, (event) => {
          if (event.payload.requestId !== requestId) return
          finish(() => {
            try {
              resolve(parseSnapshot(event.payload.payload))
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)))
            }
          })
        })
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))))
        return
      }

      timer = setTimeout(() => {
        finish(() => reject(new Error('Timed out waiting for page content')))
      }, timeoutMs)

      try {
        await invoke('browser_collect_content', { label, requestId })
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))))
      }
    })()
  })
}
