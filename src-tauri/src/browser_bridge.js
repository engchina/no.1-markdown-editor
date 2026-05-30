// Browser agent content-script bridge.
//
// Injected into every external browser webview via WebviewBuilder::initialization_script.
// Its job is to, on demand, build a structured snapshot of the current page
// (plain text + lightweight Markdown + an indexed list of interactive elements)
// and report it back to the host (main window).
//
// Two report channels are attempted, in order:
//   1. window.__TAURI_INTERNALS__.invoke('browser_report_content', { requestId, payload })
//      - fast, single round-trip. Available only if a capability exposes that
//        command to this (external) webview. By default it is not, so this path
//        rejects and we fall back to the title channel below.
//   2. document.title chunk channel - guaranteed cross-platform. The payload is
//      base64-encoded and split into chunks written to document.title; the Rust
//      side reassembles them via on_document_title_changed.
//
// Collection is triggered by the host calling
//   eval("window.__agentCollect('<requestId>')").

;(function () {
  if (window.__agentBridgeReady) return
  window.__agentBridgeReady = true

  var TITLE_MARKER = '__AGENT__'

  function textOf(el) {
    return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  function isVisible(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false
    var style = window.getComputedStyle(el)
    if (!style) return true
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
  }

  function roleOf(el) {
    var explicit = el.getAttribute && el.getAttribute('role')
    if (explicit) return explicit
    var tag = el.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'button') return 'button'
    if (tag === 'input') {
      var t = (el.getAttribute('type') || 'text').toLowerCase()
      if (t === 'submit' || t === 'button') return 'button'
      if (t === 'checkbox') return 'checkbox'
      if (t === 'radio') return 'radio'
      return 'textbox'
    }
    if (tag === 'textarea') return 'textbox'
    if (tag === 'select') return 'combobox'
    return tag
  }

  // Build a compact accessibility-style list of interactive elements.
  // Each entry: { idx, role, name }. The idx is also stamped onto the live DOM
  // node (data-agent-idx) so a future "act" command can resolve idx -> node.
  function collectElements(limit) {
    var selector =
      'a[href], button, input, textarea, select, [role="button"], [role="link"], [onclick]'
    var nodes = document.querySelectorAll(selector)
    var out = []
    var idx = 0
    for (var i = 0; i < nodes.length && out.length < limit; i++) {
      var el = nodes[i]
      if (!isVisible(el)) continue
      var name =
        textOf(el) ||
        el.getAttribute('aria-label') ||
        el.getAttribute('placeholder') ||
        el.getAttribute('title') ||
        ''
      name = name.slice(0, 120)
      if (!name && roleOf(el) !== 'textbox') continue
      el.setAttribute('data-agent-idx', String(idx))
      out.push({ idx: idx, role: roleOf(el), name: name })
      idx++
    }
    return out
  }

  // --- Lightweight readable-content -> Markdown -------------------------------

  function pickMainRoot() {
    var candidates = [document.querySelector('main'), document.querySelector('article')]
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && textOf(candidates[i]).length > 200) return candidates[i]
    }
    // Heuristic: the block-level element with the most text.
    var blocks = document.querySelectorAll('article, main, section, div')
    var best = document.body
    var bestLen = textOf(document.body).length * 0.4 // beat 40% of body to win
    for (var j = 0; j < blocks.length; j++) {
      var len = textOf(blocks[j]).length
      if (len > bestLen) {
        best = blocks[j]
        bestLen = len
      }
    }
    return best || document.body
  }

  function inlineMd(node) {
    var out = ''
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i]
      if (child.nodeType === 3) {
        out += child.textContent.replace(/\s+/g, ' ')
      } else if (child.nodeType === 1) {
        var tag = child.tagName.toLowerCase()
        var inner = inlineMd(child)
        if (tag === 'a') {
          var href = child.getAttribute('href') || ''
          out += href ? '[' + inner + '](' + href + ')' : inner
        } else if (tag === 'strong' || tag === 'b') {
          out += inner ? '**' + inner + '**' : ''
        } else if (tag === 'em' || tag === 'i') {
          out += inner ? '*' + inner + '*' : ''
        } else if (tag === 'code') {
          out += inner ? '`' + inner + '`' : ''
        } else if (tag === 'br') {
          out += '\n'
        } else if (tag === 'img') {
          var src = child.getAttribute('src') || ''
          var alt = child.getAttribute('alt') || ''
          if (src) out += '![' + alt + '](' + src + ')'
        } else {
          out += inner
        }
      }
    }
    return out
  }

  var SKIP_TAGS = {
    SCRIPT: 1,
    STYLE: 1,
    NOSCRIPT: 1,
    NAV: 1,
    FOOTER: 1,
    HEADER: 1,
    ASIDE: 1,
    FORM: 1,
    SVG: 1,
  }

  function blockMd(root) {
    var parts = []
    function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var el = node.childNodes[i]
        if (el.nodeType !== 1) continue
        var tag = el.tagName.toUpperCase()
        if (SKIP_TAGS[tag]) continue
        if (!isVisible(el)) continue
        var t = el.tagName.toLowerCase()
        if (/^h[1-6]$/.test(t)) {
          var level = parseInt(t.charAt(1), 10)
          var ht = inlineMd(el).trim()
          if (ht) parts.push(new Array(level + 1).join('#') + ' ' + ht)
        } else if (t === 'p' || t === 'blockquote') {
          var pt = inlineMd(el).trim()
          if (pt) parts.push(t === 'blockquote' ? '> ' + pt : pt)
        } else if (t === 'ul' || t === 'ol') {
          var items = el.querySelectorAll(':scope > li')
          for (var k = 0; k < items.length; k++) {
            var it = inlineMd(items[k]).trim()
            if (it) parts.push((t === 'ol' ? k + 1 + '. ' : '- ') + it)
          }
        } else if (t === 'pre') {
          var ct = (el.innerText || el.textContent || '').replace(/\s+$/, '')
          if (ct) parts.push('```\n' + ct + '\n```')
        } else if (t === 'img') {
          var isrc = el.getAttribute('src') || ''
          var ialt = el.getAttribute('alt') || ''
          if (isrc) parts.push('![' + ialt + '](' + isrc + ')')
        } else {
          walk(el)
        }
      }
    }
    walk(root)
    return parts.join('\n\n')
  }

  function buildSnapshot() {
    var root = pickMainRoot()
    var markdown = ''
    try {
      markdown = blockMd(root)
    } catch (e) {
      markdown = ''
    }
    var text = textOf(root).slice(0, 200000)
    if (markdown.length > 200000) markdown = markdown.slice(0, 200000)
    var elements = []
    try {
      elements = collectElements(150)
    } catch (e) {
      elements = []
    }
    return {
      url: location.href,
      title: document.title,
      text: text,
      markdown: markdown,
      elements: elements,
    }
  }

  // --- Reporting channels ----------------------------------------------------

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)))
  }

  function reportViaTitle(requestId, payload) {
    var original = document.title
    var b64 = utf8ToBase64(payload)
    var chunkSize = 1500
    var total = Math.max(1, Math.ceil(b64.length / chunkSize))
    var seq = 0
    function sendNext() {
      if (seq >= total) {
        // Restore the original title once all chunks are delivered.
        setTimeout(function () {
          document.title = original
        }, 60)
        return
      }
      var chunk = b64.slice(seq * chunkSize, (seq + 1) * chunkSize)
      // Format: __AGENT__<requestId>|<seq>|<total>|<base64 chunk>
      // Rust (handle_browser_title_report) reassembles chunks then decodes.
      document.title = TITLE_MARKER + requestId + '|' + seq + '|' + total + '|' + chunk
      seq++
      setTimeout(sendNext, 40)
    }
    sendNext()
  }

  window.__agentCollect = function (requestId) {
    var payload
    try {
      payload = JSON.stringify(buildSnapshot())
    } catch (e) {
      payload = JSON.stringify({
        url: location.href,
        title: document.title,
        text: '',
        markdown: '',
        elements: [],
        error: String(e),
      })
    }

    try {
      var internals = window.__TAURI_INTERNALS__
      if (internals && typeof internals.invoke === 'function') {
        internals
          .invoke('browser_report_content', { requestId: requestId, payload: payload })
          .then(function () {})
          .catch(function () {
            reportViaTitle(requestId, payload)
          })
        return
      }
    } catch (e) {
      // fall through to title channel
    }
    reportViaTitle(requestId, payload)
  }
})()
