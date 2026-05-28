import { useEditorStore } from '../../store/editor'
import { pushErrorNotice, pushInfoNotice, pushSuccessNotice } from '../notices'
import { runImageHostingUploadForDocument } from './runUpload.ts'

export async function triggerImageHostingUploadForActiveDocument(): Promise<void> {
  const state = useEditorStore.getState()
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId) ?? null

  if (!activeTab) {
    pushInfoNotice(
      'imageHosting.notices.noDocumentTitle',
      'imageHosting.notices.noDocumentMessage'
    )
    return
  }

  const snapshot = {
    id: activeTab.id,
    content: activeTab.content,
    path: activeTab.path ?? null,
    name: activeTab.name ?? null,
  }

  pushInfoNotice(
    'imageHosting.notices.uploadStartedTitle',
    'imageHosting.notices.uploadStartedMessage'
  )

  try {
    const outcome = await runImageHostingUploadForDocument({
      markdown: snapshot.content,
      documentPath: snapshot.path,
      documentName: snapshot.name,
    })

    switch (outcome.kind) {
      case 'not-configured':
        pushErrorNotice(
          'imageHosting.notices.notConfiguredTitle',
          'imageHosting.notices.notConfiguredMessage'
        )
        return
      case 'no-document':
        pushInfoNotice(
          'imageHosting.notices.noDocumentTitle',
          'imageHosting.notices.noDocumentMessage'
        )
        return
      case 'unsaved-document':
        pushErrorNotice(
          'imageHosting.notices.unsavedDocumentTitle',
          'imageHosting.notices.unsavedDocumentMessage'
        )
        return
      case 'no-local-images':
        pushInfoNotice(
          'imageHosting.notices.noLocalImagesTitle',
          'imageHosting.notices.noLocalImagesMessage'
        )
        return
      case 'completed': {
        if (outcome.rewrittenMarkdown !== snapshot.content) {
          useEditorStore.getState().updateTabContent(snapshot.id, outcome.rewrittenMarkdown)
        }
        if (outcome.failedCount > 0) {
          pushErrorNotice(
            'imageHosting.notices.uploadPartialTitle',
            'imageHosting.notices.uploadPartialMessage',
            {
              values: {
                uploaded: outcome.uploadedCount,
                failed: outcome.failedCount,
              },
            }
          )
        } else {
          pushSuccessNotice(
            'imageHosting.notices.uploadCompletedTitle',
            'imageHosting.notices.uploadCompletedMessage',
            {
              values: {
                uploaded: outcome.uploadedCount,
              },
            }
          )
        }
        return
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    pushErrorNotice(
      'imageHosting.notices.uploadFailedTitle',
      'imageHosting.notices.uploadFailedMessage',
      { values: { reason } }
    )
  }
}
