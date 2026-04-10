import assert from 'node:assert/strict'
import test from 'node:test'
import { createAIQuickActionOpenDetail } from '../src/lib/ai/quickActions.ts'
import { computeAISelectionBubblePosition } from '../src/lib/ai/selectionBubble.ts'

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
    { width: 224, height: 40 }
  )

  assert.equal(position.top, 50)
  assert.equal(position.left, 122)
})

test('computeAISelectionBubblePosition falls below the selection when there is not enough space above', () => {
  const position = computeAISelectionBubblePosition(
    { top: 120, bottom: 136, left: 130, right: 170 },
    { top: 100, bottom: 420, left: 100, right: 420 },
    { width: 224, height: 40 }
  )

  assert.equal(position.top, 46)
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
    { width: 224, height: 80 }
  )

  assert.equal(position.top, 30)
})
