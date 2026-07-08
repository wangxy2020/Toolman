import { TranslationPage } from '../translation/TranslationPage'
import type { ChatPageState } from './useChatPage'
import type { AppView } from '../../types/app-view'

export type ChatPageTranslateViewProps = Pick<
  ChatPageState,
  | 'workspaceId'
  | 'translationSection'
  | 'translationWorkspaceKey'
  | 'translationLanguages'
  | 'translation'
> & {
  providers: ChatPageState['chat']['providers']
  notes: ChatPageState['notes']
  setActiveView: (view: AppView) => void
}

export function ChatPageTranslateView({
  workspaceId,
  translationSection,
  translationWorkspaceKey,
  providers,
  translationLanguages,
  translation,
  notes,
  setActiveView,
}: ChatPageTranslateViewProps) {
  return (
    <TranslationPage
      key={`${translationWorkspaceKey}-${translationSection}`}
      workspaceId={workspaceId}
      section={translationSection}
      providers={providers}
      translationLanguages={translationLanguages}
      activeContrast={translation.activeContrast}
      activeDocument={translation.activeDocument}
      onSaveContrast={translation.saveContrast}
      onSaveDocument={translation.saveDocument}
      onSaveDocumentToNotes={(title, content) => {
        notes.createNoteFromMessage(title, content)
        setActiveView('notes')
      }}
      onOpenDocumentPath={translation.openDocument}
      onUpdateDocumentSourceText={translation.updateDocumentSourceText}
      onClearActiveDocument={translation.clearActiveDocument}
    />
  )
}
