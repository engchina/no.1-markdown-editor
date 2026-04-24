import assert from 'node:assert/strict'
import test from 'node:test'
import { createAIQuickActionOpenDetail } from '../src/lib/ai/quickActions.ts'
import {
  computeAISelectionBubblePosition,
  mergeSelectionBubbleRects,
} from '../src/lib/ai/selectionBubble.ts'

const t = (key: string) => key

test('createAIQuickActionOpenDetail returns the expected presets', () => {
  assert.deepEqual(createAIQuickActionOpenDetail('ask', t), {
    source: 'selection-bubble',
    intent: 'ask',
    outputTarget: 'chat-only',
  })

  assert.deepEqual(createAIQuickActionOpenDetail('translate', t), {
    source: 'selection-bubble',
    intent: 'edit',
    outputTarget: 'replace-selection',
    prompt: 'ai.templates.translatePrompt',
  })

  assert.deepEqual(createAIQuickActionOpenDetail('continueWriting', t), {
    source: 'selection-bubble',
    intent: 'generate',
    outputTarget: 'at-cursor',
    prompt: 'ai.templates.continueWritingPrompt',
  })
})

test('computeAISelectionBubblePosition prefers above the selection when there is enough room', () => {
  const position = computeAISelectionBubblePosition(
    { top: 200, bottom: 220, left: 180, right: 260 },
    { top: 100, bottom: 500, left: 100, right: 700 },
    { width: 224, height: 40 },
    { gap: 5 }
  )

  assert.equal(position.top, 55)
  assert.equal(position.left, 120)
})

test('computeAISelectionBubblePosition falls below the selection when there is not enough space above', () => {
  const position = computeAISelectionBubblePosition(
    { top: 120, bottom: 136, left: 130, right: 170 },
    { top: 100, bottom: 420, left: 100, right: 420 },
    { width: 224, height: 40 },
    { gap: 5 }
  )

  assert.equal(position.top, 41)
})

test('computeAISelectionBubblePosition clamps wide measured bubbles to the editor bounds', () => {
  const position = computeAISelectionBubblePosition(
    { top: 220, bottom: 240, left: 160, right: 200 },
    { top: 100, bottom: 420, left: 100, right: 340 },
    { width: 280, height: 48 }
  )

  assert.equal(position.left, 120)
})

test('computeAISelectionBubblePosition keeps tall measured bubbles inside the editor shell', () => {
  const position = computeAISelectionBubblePosition(
    { top: 120, bottom: 136, left: 150, right: 190 },
    { top: 100, bottom: 220, left: 100, right: 360 },
    { width: 224, height: 80 },
    { gap: 5 }
  )

  assert.equal(position.top, 36)
})

test('mergeSelectionBubbleRects expands selection endpoints into a full selection block', () => {
  const merged = mergeSelectionBubbleRects(
    { top: 140, bottom: 160, left: 210, right: 260 },
    { top: 200, bottom: 220, left: 150, right: 320 }
  )

  assert.deepEqual(merged, {
    top: 140,
    bottom: 220,
    left: 150,
    right: 320,
  })
})

test('mergeSelectionBubbleRects ignores transient rects with invalid coordinates', () => {
  const merged = mergeSelectionBubbleRects(
    { top: Number.NaN, bottom: 160, left: 210, right: 260 },
    { top: 200, bottom: 220, left: 150, right: 320 }
  )

  assert.deepEqual(merged, {
    top: 200,
    bottom: 220,
    left: 150,
    right: 320,
  })
})

test('computeAISelectionBubblePosition keeps the bubble within a quarter-line gap below the cursor line', () => {
  const selectionRect = mergeSelectionBubbleRects(
    { top: 140, bottom: 160, left: 210, right: 260 },
    { top: 200, bottom: 220, left: 150, right: 320 }
  )

  assert.ok(selectionRect)

  const position = computeAISelectionBubblePosition(
    selectionRect,
    { top: 100, bottom: 500, left: 100, right: 700 },
    { width: 224, height: 40 },
    { gap: 5 }
  )

  assert.equal(position.top, 125)
})

test('computeAISelectionBubblePosition falls back to default measurements when inputs are not finite', () => {
  const position = computeAISelectionBubblePosition(
    { top: 200, bottom: 220, left: 180, right: 260 },
    { top: 100, bottom: 500, left: 100, right: 700 },
    { width: Number.NaN, height: Number.NaN },
    { gap: Number.NaN, edgePadding: Number.NaN }
  )

  assert.equal(position.top, 56)
  assert.equal(position.left, 120)
})
