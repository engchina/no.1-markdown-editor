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
  var EXTRACTION_MODES = {
    auto: 1,
    article: 1,
    selection: 1,
    visible: 1,
    list: 1,
  }
  var extractionStats = null
  var TEXT_SKIP_TAGS = {
    HEAD: 1,
    LINK: 1,
    META: 1,
    NOSCRIPT: 1,
    SCRIPT: 1,
    STYLE: 1,
    SVG: 1,
    TEMPLATE: 1,
  }
  var ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF]/g

  function normalizeExtractionMode(mode) {
    return typeof mode === 'string' && EXTRACTION_MODES[mode] ? mode : 'auto'
  }

  function resetExtractionStats(requestedMode) {
    extractionStats = {
      requestedMode: requestedMode,
      mode: 'fallback',
      root: '',
      source: '',
      contentLength: 0,
      markdownLength: 0,
      articleCandidates: 0,
      articleCards: 0,
      filteredElements: 0,
    }
  }

  function markFiltered() {
    if (extractionStats) extractionStats.filteredElements++
  }

  function shouldSkipTextNode(node) {
    var parent = node && node.parentElement
    while (parent && parent !== document.documentElement) {
      if (shouldSuppressTextElement(parent)) return true
      parent = parent.parentElement
    }
    return false
  }

  function shouldSuppressTextElement(el) {
    if (!el || !el.getAttribute) return false
    var tag = el.tagName ? el.tagName.toUpperCase() : ''
    if (TEXT_SKIP_TAGS[tag]) return true
    if (el.hidden || el.getAttribute('aria-hidden') === 'true' || el.getAttribute('inert') !== null) return true
    if (el.isConnected && window.getComputedStyle) {
      var style = window.getComputedStyle(el)
      if (!style) return false
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true
      if (style.opacity === '0' || style.contentVisibility === 'hidden') return true
    }
    return false
  }

  function normalizeExtractedText(text) {
    return (text || '').replace(ZERO_WIDTH_RE, '').replace(/\s+/g, ' ').trim()
  }

  function textOf(el) {
    if (!el) return ''
    var parts = []
    function walkText(node) {
      if (!node) return
      if (node.nodeType === 3) {
        if (!shouldSkipTextNode(node)) parts.push(node.textContent || '')
        return
      }
      if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return
      if (node.nodeType === 1) {
        if (shouldSuppressTextElement(node)) return
        var tag = node.tagName ? node.tagName.toUpperCase() : ''
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          var controlText = node.value || node.getAttribute('placeholder') || node.getAttribute('aria-label') || ''
          if (controlText) parts.push(controlText)
          return
        }
      }
      for (var i = 0; i < node.childNodes.length; i++) walkText(node.childNodes[i])
    }
    walkText(el)
    return normalizeExtractedText(parts.join(' '))
  }

  function looksLikeImplementationText(text) {
    var value = (text || '').replace(/\s+/g, ' ').trim()
    if (value.length < 240) return false
    var codeSignals = 0
    if (/\(?function\s*\(|=>\s*\{/.test(value)) codeSignals++
    if (/\bdocument\.(addEventListener|getElementById|querySelector|prerendering|hidden)\b/.test(value)) codeSignals++
    if (/\bObject\.defineProperty\b|\bArray\.prototype\.values\b/.test(value)) codeSignals++
    if (/\bwindow\b|\bglobalThis\b|\bSymbol\.iterator\b/.test(value)) codeSignals++
    if (/\bgoogle\.[a-z0-9_.]+\b/i.test(value)) codeSignals++
    var punctuation = (value.match(/[{};=]/g) || []).length
    return codeSignals >= 2 || (codeSignals >= 1 && punctuation / value.length > 0.08)
  }

  function cleanHumanText(text) {
    var value = normalizeExtractedText(text)
    return looksLikeImplementationText(value) ? '' : value
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

  function normalizeLinkUrl(rawUrl) {
    var raw = (rawUrl || '').trim()
    if (!raw) return ''
    try {
      var url = new URL(raw, location.href)
      var protocol = url.protocol.toLowerCase()
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:') {
        return url.href
      }
      return ''
    } catch (e) {
      return ''
    }
  }

  function normalizeImageUrl(rawUrl) {
    var raw = (rawUrl || '').trim()
    if (!raw) return ''
    try {
      var url = new URL(raw, location.href)
      var protocol = url.protocol.toLowerCase()
      if (protocol === 'http:' || protocol === 'https:') return url.href
      return ''
    } catch (e) {
      return ''
    }
  }

  function markdownLinkText(text) {
    return (text || '').replace(/\s+/g, ' ').trim().replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
  }

  function markdownLinkUrl(url) {
    return (url || '').replace(/\)/g, '%29')
  }

  function markdownLink(label, url) {
    return '[' + markdownLinkText(label) + '](' + markdownLinkUrl(url) + ')'
  }

  function shouldIncludeImage(el) {
    if (!el) {
      markFiltered()
      return false
    }
    if (el.getAttribute('aria-hidden') === 'true') {
      markFiltered()
      return false
    }
    var role = (el.getAttribute('role') || '').toLowerCase()
    if (role === 'presentation' || role === 'none') {
      markFiltered()
      return false
    }
    var className = String(el.className || '')
    if (/avatar|badge|icon|logo|profile|user|thumb|emoji|symbol/i.test(className)) {
      markFiltered()
      return false
    }
    var rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 }
    var width = Math.max(Number(el.naturalWidth || 0), Number(rect.width || 0))
    var height = Math.max(Number(el.naturalHeight || 0), Number(rect.height || 0))
    if (width && height && (width < 180 || height < 120)) {
      markFiltered()
      return false
    }
    if (!el.getAttribute('alt') && width && height && width < 320 && height < 240) {
      markFiltered()
      return false
    }
    return true
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

  function uniqueElements(nodes) {
    var out = []
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] && out.indexOf(nodes[i]) === -1) out.push(nodes[i])
    }
    return out
  }

  function isLikelyArticleHref(href) {
    if (!href) return false
    try {
      var url = new URL(href)
      var path = url.pathname || ''
      if (/\/items\/[A-Za-z0-9_-]+/.test(path)) return true
      if (/\/(article|articles|post|posts|blog|news)\//i.test(path)) return true
      return false
    } catch (e) {
      return false
    }
  }

  function isLikelyArticlePageUrl(href) {
    if (!href) return false
    try {
      var url = new URL(href, location.href)
      var path = url.pathname || ''
      if (/\/items\/[A-Za-z0-9_-]+\/?$/.test(path)) return true
      if (/\/(article|articles|post|posts|blog|news|story|stories)\//i.test(path)) return true
      var segments = path.split('/').filter(Boolean)
      if (segments.length >= 2 && /[a-z0-9][a-z0-9_-]{8,}/i.test(segments[segments.length - 1])) return true
      return false
    } catch (e) {
      return false
    }
  }

  function isLowValueContentHref(url) {
    var path = (url.pathname || '').replace(/\/+$/, '').toLowerCase()
    if (!path || path === '/') return true
    if (/\.(avif|css|gif|ico|jpeg|jpg|js|json|png|svg|webp|xml)$/i.test(path)) return true
    if (/\/(account|accounts|auth|cart|category|categories|checkout|contact|docs?$|download|help|login|logout|pricing|privacy|search|settings|signin|signup|tag|tags|terms|user|users)$/i.test(path)) return true
    return false
  }

  function hasSlugLikePath(url) {
    var path = url.pathname || ''
    if (/\d{4}\/\d{1,2}\/\d{1,2}/.test(path)) return true
    var segments = path.split('/').filter(Boolean)
    if (!segments.length) return false
    var last = segments[segments.length - 1]
    if (/[a-z0-9][a-z0-9_-]{10,}/i.test(last)) return true
    if (/[a-z][a-z0-9_-]*-[a-z0-9_-]*[a-z0-9]/i.test(last) && last.length >= 8) return true
    return false
  }

  function isLikelyContentHref(href, title) {
    if (!href || isNavigationLikeText(title)) return false
    try {
      var url = new URL(href, location.href)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
      if (isLowValueContentHref(url)) return false
      if (isLikelyArticleHref(url.href)) return true
      return hasSlugLikePath(url)
    } catch (e) {
      return false
    }
  }

  function countLongTextBlocks(el) {
    var nodes = el.querySelectorAll('p, blockquote')
    var count = 0
    for (var i = 0; i < nodes.length; i++) {
      if (textOf(nodes[i]).length >= 45) count++
    }
    return count
  }

  function countContentBlocks(el) {
    return el.querySelectorAll('p, blockquote, pre, table, figure, img, video, iframe').length
  }

  function linkTextRatio(el) {
    var total = textOf(el).length
    if (!total) return 0
    var links = el.querySelectorAll('a[href]')
    var linked = 0
    for (var i = 0; i < links.length; i++) linked += textOf(links[i]).length
    return linked / total
  }

  function classWeight(el) {
    if (!el || !el.getAttribute) return 0
    var identity = [
      el.id || '',
      String(el.className || ''),
      el.getAttribute('data-testid') || '',
      el.getAttribute('role') || '',
    ].join(' ')
    var weight = 0
    if (/article|body|content|entry|hentry|main|page|pagination|post|story|text|blog/i.test(identity)) weight += 25
    if (/ad|advert|banner|breadcrumb|comment|combx|contact|footer|header|login|menu|meta|nav|promo|related|remark|rss|share|shoutbox|sidebar|sponsor|subscribe|tag|widget/i.test(identity)) {
      weight -= 25
    }
    return weight
  }

  function readabilityParagraphScore(text) {
    var value = (text || '').replace(/\s+/g, ' ').trim()
    if (value.length < 45) return 0
    return 1 + Math.min(value.length / 90, 12) + Math.min((value.match(/[,.，。;；、]/g) || []).length, 8)
  }

  function candidateTagBonus(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : ''
    if (tag === 'article') return 35
    if (tag === 'main') return 20
    if (tag === 'section') return 8
    if (tag === 'div') return 4
    return 0
  }

  function pickReadabilityRoot() {
    var paragraphs = document.querySelectorAll('p, pre, blockquote')
    var candidates = []
    var scores = []
    for (var i = 0; i < paragraphs.length; i++) {
      var paragraph = paragraphs[i]
      if (!isVisible(paragraph)) continue
      var baseScore = readabilityParagraphScore(textOf(paragraph))
      if (!baseScore) continue

      var parent = paragraph.parentElement
      var depth = 0
      while (parent && parent !== document.body && depth < 4) {
        var index = candidates.indexOf(parent)
        if (index === -1) {
          candidates.push(parent)
          scores.push(classWeight(parent) + candidateTagBonus(parent))
          index = candidates.length - 1
        }
        scores[index] += baseScore / Math.max(1, depth + 1)
        parent = parent.parentElement
        depth++
      }
    }

    var best = null
    var bestScore = 0
    for (var j = 0; j < candidates.length; j++) {
      var el = candidates[j]
      var textLength = textOf(el).length
      var score = scores[j]
      score += Math.min(textLength / 120, 80)
      score -= linkTextRatio(el) * 80
      score += Math.min(el.querySelectorAll('h1, h2, h3').length, 8) * 4
      if (shouldSkipContentElement(el)) score -= 50
      if (hasDenseArticleCardLinks(el)) score -= 30
      if (score > bestScore && hasLongFormSignals(el)) {
        best = el
        bestScore = score
      }
    }

    if (extractionStats) extractionStats.articleCandidates = candidates.length
    return best
  }

  function matchesContentContainer(el) {
    if (!el || !el.matches) return false
    return el.matches(
      'article, [role="article"], [itemprop="articleBody"], [itemtype*="Article"], [itemtype*="BlogPosting"], ' +
        '.markdown-body, .md-content, .post-content, .entry-content, .article-content, .article-body, .story-content, ' +
        '[class*="MarkdownBody"], [class*="markdown-body"], [class*="MdContent"], [class*="ArticleBody"], [class*="article-body"], [class*="articleBody"], [class*="post-content"], [class*="entry-content"], [data-testid*="article"]'
    )
  }

  function hasLongFormSignals(el) {
    var textLength = textOf(el).length
    var longBlocks = countLongTextBlocks(el)
    var contentBlocks = countContentBlocks(el)
    var headings = el.querySelectorAll('h1, h2, h3').length
    var codeBlocks = el.querySelectorAll('pre, code').length
    var ratio = linkTextRatio(el)
    var articleUrl = isLikelyArticlePageUrl(location.href)
    if (articleUrl && matchesContentContainer(el) && textLength >= 120 && contentBlocks >= 2 && ratio < 0.55) return true
    if (matchesContentContainer(el) && textLength >= 180 && headings >= 1 && (longBlocks >= 1 || contentBlocks >= 2) && ratio < 0.65) return true
    if (textLength < 250) {
      return false
    }
    if (textLength >= 1200 && (longBlocks >= 2 || (contentBlocks >= 6 && ratio < 0.45) || codeBlocks >= 1)) return true
    if (articleUrl && textLength >= 350 && (longBlocks >= 1 || contentBlocks >= 2 || headings >= 1)) return true
    if (matchesContentContainer(el) && textLength >= 600 && (longBlocks >= 1 || contentBlocks >= 2)) return true
    return false
  }

  function articleCandidateScore(el) {
    var textLength = textOf(el).length
    var score = Math.min(textLength, 80000)
    var tag = el.tagName.toLowerCase()
    if (tag === 'article') score += 12000
    if (matchesContentContainer(el)) score += 10000
    if (el.querySelector('h1')) score += 3000
    score += Math.min(countLongTextBlocks(el), 20) * 700
    score += Math.min(countContentBlocks(el), 30) * 250
    var ratio = linkTextRatio(el)
    if (ratio > 0.65 && textLength < 5000) score -= 20000
    if (hasDenseArticleCardLinks(el)) {
      score -= 15000
    }
    return score
  }

  function hasDenseArticleCardLinks(el) {
    var links = el.querySelectorAll('a[href]')
    var contentLinks = 0
    for (var i = 0; i < links.length; i++) {
      var link = links[i]
      var href = normalizeLinkUrl(link.getAttribute('href') || '')
      if (isLikelyContentHref(href, textOf(link))) contentLinks++
      if (contentLinks >= 8) break
    }
    return contentLinks >= 8 && countLongTextBlocks(el) < 2
  }

  function pickArticleRoot() {
    var readable = pickReadabilityRoot()
    if (readable) return readable

    var selector =
      '[itemprop="articleBody"], article [itemprop="articleBody"], ' +
      'article .markdown-body, article .md-content, article .post-content, article .entry-content, article .article-content, article .article-body, ' +
      'article [class*="MarkdownBody"], article [class*="MdContent"], article [class*="article-body"], article [class*="articleBody"], article [class*="post-content"], article [class*="entry-content"], ' +
      'article, [role="article"], [itemtype*="Article"], [itemtype*="BlogPosting"], ' +
      '.markdown-body, .md-content, .post-content, .entry-content, .article-content, .article-body, .story-content, ' +
      '[class*="MarkdownBody"], [class*="markdown-body"], [class*="MdContent"], [class*="ArticleBody"], [class*="article-body"], [class*="articleBody"], [class*="post-content"], [class*="entry-content"], [data-testid*="article"], main'
    var nodes = uniqueElements(document.querySelectorAll(selector))
    var best = null
    var bestScore = 0
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (!isVisible(el)) continue
      if (!hasLongFormSignals(el)) continue
      var score = articleCandidateScore(el)
      if (score > bestScore) {
        best = el
        bestScore = score
      }
    }
    return best
  }

  function isNavigationLikeText(text) {
    var value = (text || '').replace(/\s+/g, ' ').trim()
    if (!value || value.length < 8 || value.length > 180) return true
    if (/^(home|login|signup|follow|followers?|likes?|posts?|articles?|members?|profile|see more|show more)$/i.test(value)) {
      return true
    }
    if (/^@\s*[A-Za-z0-9_-]{1,32}(?:\s*\([^)]+\))?$/.test(value)) return true
    if (/^[@#]?[A-Za-z0-9_+-]{1,24}$/.test(value)) return true
    return false
  }

  function isLikelySectionHeadingText(text) {
    var value = (text || '').replace(/\s+/g, ' ').trim()
    if (!value || value.length > 80) return false
    if (/^(home|login|signup|follow|followers?|likes?|posts?|articles?|members?|profile|see more|show more)$/i.test(value)) {
      return false
    }
    return true
  }

  function hasArticleCardSignals(el, title) {
    var text = textOf(el)
    if (!text || text.length <= title.length || text.length > 1800) return false
    if (el.querySelector('time')) return true
    if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日/.test(text)) return true
    if (/@[A-Za-z0-9_-]+/.test(text)) return true
    if (el.querySelector('a[href*="/tags/"], a[href*="/tag/"], a[href*="/items/"]')) return true
    return false
  }

  function normalizedClassToken(token) {
    return token.replace(/[0-9_-]+$/g, '').toLowerCase()
  }

  function cardSignature(el) {
    if (!el || !el.tagName) return ''
    var tokens = String(el.className || '')
      .split(/\s+/)
      .map(normalizedClassToken)
      .filter(function (token) {
        return token && !/^(active|current|dark|hover|is|js|selected|visible)$/.test(token)
      })
      .slice(0, 3)
    var tag = el.tagName.toLowerCase()
    return tag + (tokens.length ? '.' + tokens.join('.') : '')
  }

  function stableAttributeSignature(el) {
    if (!el || !el.getAttribute) return ''
    var names = ['id', 'class', 'role', 'itemprop', 'itemtype', 'data-testid', 'aria-label']
    var parts = []
    for (var i = 0; i < names.length; i++) {
      var name = names[i]
      var value = el.getAttribute(name)
      if (!value) continue
      value = String(value)
        .replace(/[0-9a-f]{8,}/gi, '')
        .replace(/\d+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      if (value) parts.push(name + '=' + value)
    }
    return parts.join(' ')
  }

  function directTagSignature(el, selector, limit) {
    if (!el || !el.querySelectorAll) return ''
    var nodes = el.querySelectorAll(selector)
    var tags = []
    for (var i = 0; i < nodes.length && tags.length < limit; i++) {
      if (nodes[i].parentElement !== el && selector === ':scope > *') continue
      if (!nodes[i].tagName) continue
      tags.push(nodes[i].tagName.toLowerCase())
    }
    return tags.join(' ')
  }

  function siblingTagSignature(el) {
    if (!el || !el.parentElement) return ''
    var parts = []
    var prev = el.previousElementSibling
    var next = el.nextElementSibling
    if (prev && prev.tagName) parts.push('prev:' + prev.tagName.toLowerCase())
    if (next && next.tagName) parts.push('next:' + next.tagName.toLowerCase())
    return parts.join(' ')
  }

  function tagPathSignature(el, limit) {
    var parts = []
    var node = el
    while (node && node !== document.body && node.tagName && parts.length < limit) {
      parts.unshift(node.tagName.toLowerCase())
      node = node.parentElement
    }
    return parts.join('>')
  }

  function textShapeSignature(text) {
    var value = normalizeExtractedText(text)
    if (!value) return ''
    var shape = []
    if (/@[A-Za-z0-9_-]+/.test(value)) shape.push('handle')
    if (/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日/.test(value)) shape.push('date')
    if (/[。！？.!?：:]/.test(value)) shape.push('punct')
    if (value.length >= 120) shape.push('summary')
    return shape.join(' ')
  }

  function elementFingerprint(el) {
    var parent = el && el.parentElement
    var grandparent = parent && parent.parentElement
    return {
      tag: el && el.tagName ? el.tagName.toLowerCase() : '',
      parentTag: parent && parent.tagName ? parent.tagName.toLowerCase() : '',
      grandparentTag: grandparent && grandparent.tagName ? grandparent.tagName.toLowerCase() : '',
      attrs: stableAttributeSignature(el),
      parentAttrs: stableAttributeSignature(parent),
      childTags: directTagSignature(el, ':scope > *', 8),
      descendantTags: directTagSignature(el, 'h1, h2, h3, a, time, p, img, figure, pre, table', 10),
      siblings: siblingTagSignature(el),
      path: tagPathSignature(el, 5),
      textShape: textShapeSignature(textOf(el)),
    }
  }

  function tokenMap(value) {
    var map = {}
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9_\-\u3040-\u30ff\u3400-\u9fff]+/i)
      .forEach(function (token) {
        if (token) map[token] = 1
      })
    return map
  }

  function tokenSimilarity(left, right) {
    var a = tokenMap(left)
    var b = tokenMap(right)
    var union = 0
    var intersection = 0
    for (var key in a) {
      union++
      if (b[key]) intersection++
    }
    for (var other in b) {
      if (!a[other]) union++
    }
    return union ? intersection / union : 0
  }

  function elementFingerprintSimilarity(left, right) {
    if (!left || !right) return 0
    var score = 0
    if (left.tag && left.tag === right.tag) score += 0.2
    if (left.parentTag && left.parentTag === right.parentTag) score += 0.12
    if (left.grandparentTag && left.grandparentTag === right.grandparentTag) score += 0.08
    score += tokenSimilarity(left.attrs, right.attrs) * 0.18
    score += tokenSimilarity(left.parentAttrs, right.parentAttrs) * 0.1
    score += tokenSimilarity(left.childTags, right.childTags) * 0.12
    score += tokenSimilarity(left.descendantTags, right.descendantTags) * 0.1
    score += tokenSimilarity(left.siblings, right.siblings) * 0.05
    score += tokenSimilarity(left.path, right.path) * 0.03
    score += tokenSimilarity(left.textShape, right.textShape) * 0.02
    return score
  }

  function similarFingerprintCount(candidate, candidates) {
    var count = 0
    for (var i = 0; i < candidates.length; i++) {
      if (elementFingerprintSimilarity(candidate.fingerprint, candidates[i].fingerprint) >= 0.58) count++
    }
    return count
  }

  function isInsidePageChrome(el) {
    var node = el
    while (node && node !== document.body) {
      if (!node.tagName) return false
      var tag = node.tagName.toUpperCase()
      if (tag === 'ASIDE' || tag === 'FOOTER' || tag === 'FORM' || tag === 'HEADER' || tag === 'NAV') return true
      var role = (node.getAttribute('role') || '').toLowerCase()
      if (role === 'banner' || role === 'contentinfo' || role === 'navigation' || role === 'search') return true
      var identity = [
        node.id || '',
        String(node.className || ''),
        node.getAttribute('data-testid') || '',
        node.getAttribute('aria-label') || '',
      ].join(' ')
      if (/(^|\b)(breadcrumb|footer|header|login|menu|modal|nav|pagination|search|share|social|toolbar)(\b|$)/i.test(identity)) return true
      node = node.parentElement
    }
    return false
  }

  function hasGenericCardSignals(el, title) {
    var text = textOf(el)
    if (!text || text.length <= title.length || text.length > 2200) return false
    if (hasArticleCardSignals(el, title)) return true
    if (el.querySelector('h1, h2, h3, [class*="title"], [class*="headline"], [data-testid*="title"]')) return true
    if (el.querySelector('[class*="author"], [class*="byline"], [class*="date"], [class*="meta"], [class*="summary"]')) return true
    if (countContentBlocks(el) >= 1 && linkTextRatio(el) < 0.85) return true
    return false
  }

  function findContentCard(link, root, title) {
    var node = link
    var fallback = null
    for (var depth = 0; node && node !== root && node !== document.body && depth < 8; depth++) {
      if (node.nodeType !== 1) break
      var tag = node.tagName.toLowerCase()
      if (tag === 'article' || tag === 'li') return node
      if (!fallback && hasGenericCardSignals(node, title)) fallback = node
      node = node.parentElement
    }
    return fallback || link.parentElement
  }

  function contentCardScore(candidate, signatureCount, similarCount) {
    var score = 0
    if (isLikelyArticleHref(candidate.href)) score += 4
    if (hasSlugLikePath(new URL(candidate.href))) score += 2
    if (hasArticleCardSignals(candidate.card, candidate.title)) score += 4
    else if (hasGenericCardSignals(candidate.card, candidate.title)) score += 2
    if (similarCount >= 3) score += 4
    else if (similarCount >= 2) score += 2
    if (signatureCount >= 3) score += 1
    var tag = candidate.card.tagName ? candidate.card.tagName.toLowerCase() : ''
    if (tag === 'article' || tag === 'li') score += 1
    if (candidate.title.length >= 18) score += 1
    if (/[。！？.!?：:]/.test(candidate.title) || /\s/.test(candidate.title)) score += 1
    if (isInsidePageChrome(candidate.link) || isInsidePageChrome(candidate.card)) score -= 5
    return score
  }

  function headingLevel(heading) {
    var tag = heading.tagName ? heading.tagName.toLowerCase() : ''
    if (/^h[1-6]$/.test(tag)) return parseInt(tag.charAt(1), 10)
    var ariaLevel = Number(heading.getAttribute('aria-level') || 0)
    return Number.isFinite(ariaLevel) && ariaLevel > 0 ? ariaLevel : 2
  }

  function isArticleCardHeading(heading) {
    var title = textOf(heading)
    var links = heading.querySelectorAll('a[href]')
    for (var i = 0; i < links.length; i++) {
      var href = normalizeLinkUrl(links[i].getAttribute('href') || '')
      if (isLikelyContentHref(href, title)) return true
    }
    var node = heading.parentElement
    for (var depth = 0; node && node !== document.body && depth < 6; depth++) {
      var tag = node.tagName ? node.tagName.toLowerCase() : ''
      if ((tag === 'article' || tag === 'li') && hasGenericCardSignals(node, title)) return true
      node = node.parentElement
    }
    return false
  }

  function nearestSectionHeading(card, root) {
    var headings = root.querySelectorAll('h1, h2, h3, [role="heading"]')
    var section = ''
    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i]
      if (card.contains(heading)) continue
      if (headingLevel(heading) > 3) continue
      if (isArticleCardHeading(heading)) continue
      var relation = heading.compareDocumentPosition(card)
      if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) === 0) continue
      var label = textOf(heading)
      if (isLikelySectionHeadingText(label)) section = label
    }
    return section
  }

  function extractAuthorFromText(text) {
    var value = (text || '').replace(/\s+/g, ' ').trim()
    var handle = value.match(/@[A-Za-z0-9_-]+(?:\s*\([^)]+\))?/)
    if (handle) return handle[0].replace(/\s+/g, ' ').trim()
    var byline = value.match(/\b(?:by|author)\s+([^·|,]{2,80})/i)
    return byline ? byline[0].replace(/\s+/g, ' ').trim() : ''
  }

  function extractArticleAuthor(card, title) {
    var authorNodes = card.querySelectorAll('[class*="author"], [class*="user"], [class*="byline"], [data-testid*="author"], [itemprop*="author"]')
    for (var a = 0; a < authorNodes.length; a++) {
      var author = extractAuthorFromText(textOf(authorNodes[a]))
      if (author) return author
    }
    var links = card.querySelectorAll('a[href]')
    for (var l = 0; l < links.length; l++) {
      var link = links[l]
      var text = textOf(link)
      if (!text || text === title) continue
      var href = normalizeLinkUrl(link.getAttribute('href') || '')
      if (isLikelyContentHref(href, text)) continue
      var linkAuthor = extractAuthorFromText(text)
      if (linkAuthor) return linkAuthor
    }
    var nodes = card.querySelectorAll('span, div')
    for (var i = 0; i < nodes.length; i++) {
      var nodeText = textOf(nodes[i])
      if (!nodeText || nodeText.indexOf(title) !== -1) continue
      var fallbackAuthor = extractAuthorFromText(nodeText)
      if (fallbackAuthor) return fallbackAuthor
    }
    return ''
  }

  function extractArticleDate(card) {
    var time = card.querySelector('time')
    if (time) return textOf(time) || time.getAttribute('datetime') || ''
    var text = textOf(card)
    var match = text.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{4}年\d{1,2}月\d{1,2}日/)
    return match ? match[0] : ''
  }

  function extractArticleTags(card, title) {
    var tags = []
    var seen = {}
    var nodes = card.querySelectorAll('a[href*="/tags/"], a[href*="/tag/"]')
    for (var i = 0; i < nodes.length && tags.length < 8; i++) {
      var tag = textOf(nodes[i])
      if (!tag || tag === title || tag.length > 40 || seen[tag]) continue
      seen[tag] = true
      tags.push(tag)
    }
    return tags
  }

  function formatArticleTag(tag) {
    return '`' + tag.replace(/`/g, '\\`') + '`'
  }

  function buildArticleListMarkdown(root) {
    var links = root.querySelectorAll('a[href]')
    var seen = {}
    var candidates = []
    var signatureCounts = {}
    var records = []

    for (var i = 0; i < links.length && candidates.length < 120; i++) {
      var link = links[i]
      if (!isVisible(link)) continue
      var href = normalizeLinkUrl(link.getAttribute('href') || '')
      var title = textOf(link)
      if (!isLikelyContentHref(href, title)) continue
      if (isNavigationLikeText(title)) continue
      var key = href.replace(/#.*$/, '')
      if (seen[key]) continue
      var card = findContentCard(link, root, title)
      if (!card || !isVisible(card)) continue
      seen[key] = true
      var signature = cardSignature(card)
      signatureCounts[signature] = (signatureCounts[signature] || 0) + 1
      candidates.push({
        title: title,
        href: key,
        link: link,
        card: card,
        signature: signature,
        fingerprint: elementFingerprint(card),
        similarCount: 1,
      })
    }

    for (var groupIndex = 0; groupIndex < candidates.length; groupIndex++) {
      candidates[groupIndex].similarCount = similarFingerprintCount(candidates[groupIndex], candidates)
    }

    for (var c = 0; c < candidates.length && records.length < 60; c++) {
      var candidate = candidates[c]
      var score = contentCardScore(candidate, signatureCounts[candidate.signature] || 0, candidate.similarCount || 1)
      if (score < 6) continue
      records.push({
        title: candidate.title,
        href: candidate.href,
        section: nearestSectionHeading(candidate.card, root),
        author: extractArticleAuthor(candidate.card, candidate.title),
        date: extractArticleDate(candidate.card),
        tags: extractArticleTags(candidate.card, candidate.title),
      })
    }

    if (records.length < 3) return ''
    if (extractionStats) extractionStats.articleCards = records.length

    var parts = []
    var currentSection = ''
    for (var j = 0; j < records.length; j++) {
      var record = records[j]
      if (record.section && record.section !== currentSection) {
        currentSection = record.section
        if (parts.length) parts.push('')
        parts.push('### ' + currentSection)
        parts.push('')
      }
      var meta = []
      if (record.author) meta.push(record.author)
      if (record.date) meta.push(record.date)
      var suffix = []
      if (meta.length) suffix.push(meta.join(' · '))
      if (record.tags.length) suffix.push('tags: ' + record.tags.map(formatArticleTag).join(', '))
      parts.push('- ' + markdownLink(record.title, record.href) + (suffix.length ? ' — ' + suffix.join('; ') : ''))
    }
    return parts.join('\n')
  }

  function inlineMd(node) {
    var out = ''
    for (var i = 0; i < node.childNodes.length; i++) {
      var child = node.childNodes[i]
      if (child.nodeType === 3) {
        out += (child.textContent || '').replace(ZERO_WIDTH_RE, '').replace(/\s+/g, ' ')
      } else if (child.nodeType === 1) {
        var tag = child.tagName.toLowerCase()
        var inner = inlineMd(child)
        if (tag === 'a') {
          var href = normalizeLinkUrl(child.getAttribute('href') || '')
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
          var src = normalizeImageUrl(child.getAttribute('src') || '')
          var alt = child.getAttribute('alt') || ''
          if (src && shouldIncludeImage(child)) out += '![' + alt + '](' + src + ')'
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

  function shouldSkipContentElement(el) {
    if (!el || !el.getAttribute) return false
    if (el.getAttribute('aria-hidden') === 'true') {
      markFiltered()
      return true
    }
    var role = (el.getAttribute('role') || '').toLowerCase()
    if (role === 'navigation' || role === 'banner' || role === 'contentinfo' || role === 'complementary' || role === 'search') {
      markFiltered()
      return true
    }
    var identity = [
      el.id || '',
      String(el.className || ''),
      el.getAttribute('data-testid') || '',
      el.getAttribute('aria-label') || '',
    ].join(' ')
    var skip = /(^|\b)(ad|ads|advert|banner|breadcrumb|comment|comments|contributor|contributors|footer|header|login|menu|modal|nav|newsletter|popular|profile|promo|ranking|reaction|recommend|related|share|sidebar|social|sponsor|subscribe|toc|table-of-contents)(\b|$)/i.test(identity)
    if (skip) markFiltered()
    return skip
  }

  function buildArticleMarkdown(root) {
    if (!root || !hasLongFormSignals(root)) return ''
    return blockMd(root)
  }

  function describeRoot(el) {
    if (!el || !el.tagName) return ''
    var out = el.tagName.toLowerCase()
    if (el.id) out += '#' + el.id
    var classes = String(el.className || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
    if (classes.length) out += '.' + classes.join('.')
    return out
  }

  function viewportIntersects(el) {
    if (!el || !el.getBoundingClientRect) return false
    var rect = el.getBoundingClientRect()
    var width = window.innerWidth || document.documentElement.clientWidth || 0
    var height = window.innerHeight || document.documentElement.clientHeight || 0
    return rect.bottom > 0 && rect.right > 0 && rect.top < height && rect.left < width
  }

  function buildSelectionMarkdown() {
    var selection = window.getSelection && window.getSelection()
    if (!selection || selection.rangeCount === 0 || String(selection).trim().length < 2) return null
    var wrapper = document.createElement('div')
    for (var i = 0; i < selection.rangeCount; i++) {
      wrapper.appendChild(selection.getRangeAt(i).cloneContents())
    }
    var markdown = blockMd(wrapper, { assumeVisible: true }) || String(selection).trim()
    return {
      markdown: markdown,
      textRoot: wrapper,
      root: wrapper,
      mode: 'selection',
      source: 'selection-range',
    }
  }

  function buildVisibleMarkdown(root) {
    var nodes = root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote, pre, ul, ol, table, figure, img')
    var wrapper = document.createElement('div')
    var seen = {}
    for (var i = 0; i < nodes.length && wrapper.childNodes.length < 120; i++) {
      var node = nodes[i]
      if (!isVisible(node) || !viewportIntersects(node) || shouldSkipContentElement(node)) continue
      var text = textOf(node)
      var key = node.tagName + ':' + text.slice(0, 120)
      if (text && seen[key]) continue
      seen[key] = true
      wrapper.appendChild(node.cloneNode(true))
    }
    var markdown = blockMd(wrapper, { assumeVisible: true })
    if (!markdown.trim()) return null
    return {
      markdown: markdown,
      textRoot: wrapper,
      root: wrapper,
      mode: 'visible',
      source: 'viewport-blocks',
    }
  }

  function makeExtractionResult(markdown, textRoot, root, mode, source) {
    if (!markdown || !markdown.trim()) return null
    return {
      markdown: markdown.trim(),
      textRoot: textRoot || root || document.body,
      root: root || textRoot || document.body,
      mode: mode,
      source: source,
    }
  }

  function buildPlainTextMarkdown(root) {
    var text = cleanHumanText(textOf(root))
    if (!text) return ''
    return text.slice(0, 12000)
  }

  function buildFallbackMarkdown(root) {
    return blockMd(root) || buildPlainTextMarkdown(root)
  }

  function resolveExtraction(requestedMode, root, articleRoot) {
    var selected = requestedMode === 'selection' || requestedMode === 'auto' ? buildSelectionMarkdown() : null
    if (selected) return selected

    if (requestedMode === 'visible') {
      var visible = buildVisibleMarkdown(root)
      if (visible) return visible
    }

    if (requestedMode === 'list') {
      return (
        makeExtractionResult(buildArticleListMarkdown(root), root, root, 'list', 'article-card-list') ||
        makeExtractionResult(buildFallbackMarkdown(root), root, root, 'fallback', 'main-root')
      )
    }

    if (requestedMode === 'article') {
      return makeExtractionResult(buildArticleMarkdown(articleRoot), articleRoot, articleRoot, 'article', 'readability-article') ||
        makeExtractionResult(buildFallbackMarkdown(root), root, root, 'fallback', 'main-root')
    }

    return (
      makeExtractionResult(buildArticleMarkdown(articleRoot), articleRoot, articleRoot, 'article', 'readability-article') ||
      makeExtractionResult(buildArticleListMarkdown(root), root, root, 'list', 'article-card-list') ||
      makeExtractionResult(buildFallbackMarkdown(root), root, root, 'fallback', 'main-root')
    )
  }

  function tableMd(table) {
    var rows = table.querySelectorAll('tr')
    var matrix = []
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('th, td')
      if (!cells.length) continue
      var row = []
      for (var j = 0; j < cells.length; j++) {
        row.push(inlineMd(cells[j]).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim())
      }
      matrix.push(row)
    }
    if (!matrix.length) return ''
    var width = 0
    for (var r = 0; r < matrix.length; r++) width = Math.max(width, matrix[r].length)
    for (var m = 0; m < matrix.length; m++) {
      while (matrix[m].length < width) matrix[m].push('')
    }
    var header = matrix[0]
    var separator = header.map(function () { return '---' })
    var body = matrix.slice(1)
    return [header, separator].concat(body).map(function (row) {
      return '| ' + row.join(' | ') + ' |'
    }).join('\n')
  }

  function codeLanguage(el) {
    var code = el.querySelector('code')
    var className = String((code && code.className) || el.className || '')
    var match = className.match(/(?:language|lang)-([A-Za-z0-9_+-]+)/)
    return match ? match[1] : ''
  }

  function figureMd(el) {
    var parts = []
    var image = el.querySelector('img')
    if (image) {
      var src = normalizeImageUrl(image.getAttribute('src') || '')
      var alt = image.getAttribute('alt') || ''
      if (src && shouldIncludeImage(image)) parts.push('![' + alt + '](' + src + ')')
    }
    var caption = el.querySelector('figcaption')
    if (caption) {
      var text = inlineMd(caption).trim()
      if (text) parts.push('_' + text + '_')
    }
    return parts.join('\n\n')
  }

  function blockMd(root, options) {
    var assumeVisible = options && options.assumeVisible
    var parts = []
    function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var el = node.childNodes[i]
        if (el.nodeType !== 1) continue
        var tag = el.tagName.toUpperCase()
        if (SKIP_TAGS[tag]) continue
        if (shouldSkipContentElement(el)) continue
        if (!assumeVisible && !isVisible(el)) continue
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
          if (ct) parts.push('```' + codeLanguage(el) + '\n' + ct + '\n```')
        } else if (t === 'table') {
          var table = tableMd(el)
          if (table) parts.push(table)
        } else if (t === 'figure') {
          var figure = figureMd(el)
          if (figure) parts.push(figure)
        } else if (t === 'img') {
          var isrc = normalizeImageUrl(el.getAttribute('src') || '')
          var ialt = el.getAttribute('alt') || ''
          if (isrc && shouldIncludeImage(el)) parts.push('![' + ialt + '](' + isrc + ')')
        } else {
          walk(el)
        }
      }
    }
    walk(root)
    return parts.join('\n\n')
  }

  function buildSnapshot(options) {
    var requestedMode = normalizeExtractionMode(options && options.mode)
    resetExtractionStats(requestedMode)
    var root = pickMainRoot()
    var articleRoot = pickArticleRoot()
    var result = null
    try {
      result = resolveExtraction(requestedMode, root, articleRoot)
    } catch (e) {
      result = null
    }
    var markdown = result ? result.markdown : ''
    var textRoot = result ? result.textRoot : articleRoot || root
    var text = textOf(textRoot).slice(0, 200000)
    if (markdown.length > 200000) markdown = markdown.slice(0, 200000)
    if (extractionStats) {
      extractionStats.mode = result ? result.mode : 'fallback'
      extractionStats.root = describeRoot(result ? result.root : textRoot)
      extractionStats.source = result ? result.source : 'empty'
      extractionStats.contentLength = text.length
      extractionStats.markdownLength = markdown.length
    }
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
      extraction: extractionStats,
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

  window.__agentCollect = function (requestId, options) {
    var payload
    try {
      payload = JSON.stringify(buildSnapshot(options || {}))
    } catch (e) {
      payload = JSON.stringify({
        url: location.href,
        title: document.title,
        text: '',
        markdown: '',
        extraction: {
          requestedMode: normalizeExtractionMode(options && options.mode),
          mode: 'fallback',
          root: '',
          source: 'error',
          contentLength: 0,
          markdownLength: 0,
          articleCandidates: 0,
          articleCards: 0,
          filteredElements: 0,
        },
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
