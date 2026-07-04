import { TranslationPage } from '../translation/TranslationPage'
import type { ChatPageState } from './useChatPage'

export type ChatPageTranslateViewProps = Pick<
  ChatPageState,
  | 'workspaceId'
  | 'translationSection'
  | 'translationWorkspaceKey'
  | 'translationLanguages'
  | 'translation'
> & {
  providers: ChatPageState['chat']['providers']
}

export function ChatPageTranslateView({
  workspaceId,
  translationSection,
  translationWorkspaceKey,
  providers,
  translationLanguages,
  translation,
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
      onOpenDocumentPath={translation.openDocument}
      onUpdateDocumentSourceText={translation.updateDocumentSourceText}
      onClearActiveDocument={translation.clearActiveDocument}
    />
  )
}
