import assert from 'node:assert/strict'
import test from 'node:test'
import { matchZoomShortcut } from '../src/lib/platform.ts'

type ZoomKeyEvent = Parameters<typeof matchZoomShortcut>[0]

function createEvent(overrides: Partial<ZoomKeyEvent>): ZoomKeyEvent {
  return {
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    code: '',
    key: '',
    isComposing: false,
    ...overrides,
  }
}

// US keyboard: '+' and '=' share the Equal key.
test('US layout zoom shortcuts', () => {
  // mac
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, code: 'Equal', key: '=' }), true), 'in')
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, shiftKey: true, code: 'Equal', key: '+' }), true), 'in')
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, code: 'Minus', key: '-' }), true), 'out')
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, code: 'Digit0', key: '0' }), true), 'reset')
  // windows (primary = ctrl)
  assert.equal(matchZoomShortcut(createEvent({ ctrlKey: true, code: 'Equal', key: '+' }), false), 'in')
  assert.equal(matchZoomShortcut(createEvent({ ctrlKey: true, code: 'Minus', key: '-' }), false), 'out')
})

// JIS keyboard on macOS WebKit: Command held makes event.key report the
// UNSHIFTED base char, and '+' lives on Semicolon, '=' lives on Minus.
// These are the exact cases the old event.key-based check got wrong.
test('JIS layout zoom-in works on macOS (regression)', () => {
  // Cmd + Shift + ';'  => '+' on JIS. Old code matched nothing.
  assert.equal(
    matchZoomShortcut(createEvent({ metaKey: true, shiftKey: true, code: 'Semicolon', key: ';' }), true),
    'in'
  )
  // Cmd + Shift + '-'  => '=' on JIS. Old code fell through to zoom-out.
  assert.equal(
    matchZoomShortcut(createEvent({ metaKey: true, shiftKey: true, code: 'Minus', key: '-' }), true),
    'in'
  )
  // Cmd + '-' (no shift) is still zoom-out on JIS.
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, code: 'Minus', key: '-' }), true), 'out')
})

// Cmd/Ctrl combos never participate in text composition, so isComposing must
// NOT block zoom. Blocking it broke Cmd++ / Cmd+- for JIS users running a
// Japanese IME (the real root cause of the "zoom stopped working" report).
test('zoom still works while a CJK IME is composing', () => {
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, isComposing: true, code: 'Equal', key: '=' }), true), 'in')
  assert.equal(
    matchZoomShortcut(createEvent({ metaKey: true, shiftKey: true, isComposing: true, code: 'Semicolon', key: ';' }), true),
    'in'
  )
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, isComposing: true, code: 'Minus', key: '-' }), true), 'out')
})

test('numeric keypad zoom shortcuts', () => {
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, code: 'NumpadAdd', key: '+' }), true), 'in')
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, code: 'NumpadSubtract', key: '-' }), true), 'out')
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, code: 'Numpad0', key: '0' }), true), 'reset')
})

test('ignores events without the platform primary modifier or with Alt', () => {
  // no modifier
  assert.equal(matchZoomShortcut(createEvent({ code: 'Equal', key: '+' }), true), null)
  // wrong modifier for platform (ctrl on mac)
  assert.equal(matchZoomShortcut(createEvent({ ctrlKey: true, code: 'Equal', key: '+' }), true), null)
  // Alt held
  assert.equal(matchZoomShortcut(createEvent({ metaKey: true, altKey: true, code: 'Equal', key: '+' }), true), null)
})
