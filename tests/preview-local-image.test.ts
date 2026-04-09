import assert from 'node:assert/strict'
import test from 'node:test'
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks'
import { loadLocalPreviewImage } from '../src/lib/previewLocalImage.ts'

test('loadLocalPreviewImage falls back to the original source outside Tauri', async () => {
  const source = './images/hero.png'

  assert.equal(await loadLocalPreviewImage(source, 'D:\\docs\\draft.md'), source)
})

test('loadLocalPreviewImage returns null when the Tauri bridge cannot read the image', async () => {
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { crypto: globalThis.crypto },
  })

  try {
    mockIPC((cmd) => {
      if (cmd === 'fetch_local_image_data_url') {
        throw new Error('missing')
      }

      return null
    })

    assert.equal(await loadLocalPreviewImage('./images/missing.png', 'D:\\docs\\draft.md'), null)
  } finally {
    clearMocks()
    if (previousWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      })
    }
  }
})
