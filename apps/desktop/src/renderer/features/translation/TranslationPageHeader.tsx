import {
  IconArrowLeftRight,
  IconClear,
  IconExternalLink,
  IconFile,
  IconSaveNote,
  IconSliders,
  IconTranslate,
} from '../../components/icons'
import { HeaderIconButton } from '../../components/layout/HeaderIconButton'
import { getModulePageConfig } from '../modules/module-config'
import { useI18n } from '../../i18n/useI18n'
import type { TranslationSidebarSection } from './translation-sidebar-types'

interface Props {
  section: TranslationSidebarSection
  sectionLabel: string
  translating: boolean
  canTranslate: boolean
  canSave: boolean
  canOpenExternally?: boolean
  onSave: () => void
  onSwapLanguages: () => void
  onTranslate: () => void
  onClear: () => void
  onOpenSettings: () => void
  onOpenDocument?: () => void
  onOpenExternally?: () => void
}

export function TranslationPageHeader({
  section,
  sectionLabel,
  translating,
  canTranslate,
  canSave,
  canOpenExternally = false,
  onSave,
  onSwapLanguages,
  onTranslate,
  onClear,
  onOpenSettings,
  onOpenDocument,
  onOpenExternally,
}: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig('translate', t)
  const isDocuments = section === 'documents'
  const translateLabel = translating
    ? t('translationPage.workspace.translating')
    : t('translationPage.workspace.translate')

  return (
    <header className="tm-chat-header">
      <div className="tm-chat-breadcrumb">
        <span className="tm-model-pill tm-module-pill">{config.title}</span>
        <span className="tm-module-breadcrumb-group">
          <span className="tm-chat-breadcrumb-sep">/</span>
          <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">{sectionLabel}</span>
        </span>
      </div>

      <div className="tm-chat-header-end">
        <HeaderIconButton
          label={
            isDocuments
              ? t('translationPage.documents.save')
              : t('translationPage.workspace.save')
          }
          disabled={!canSave}
          onClick={onSave}
        >
          <IconSaveNote size={16} />
        </HeaderIconButton>
        {isDocuments ? (
          <>
            <HeaderIconButton
              label={t('translationPage.documents.openExternally')}
              disabled={!canOpenExternally}
              onClick={onOpenExternally}
            >
              <IconExternalLink size={16} />
            </HeaderIconButton>
            <HeaderIconButton
              label={t('translationPage.documents.open')}
              onClick={onOpenDocument}
            >
              <IconFile size={16} />
            </HeaderIconButton>
          </>
        ) : (
          <HeaderIconButton
            label={t('translationPage.workspace.swapLanguages')}
            onClick={onSwapLanguages}
          >
            <IconArrowLeftRight size={16} />
          </HeaderIconButton>
        )}
        <HeaderIconButton label={t('translationPage.workspace.clear')} onClick={onClear}>
          <IconClear size={16} />
        </HeaderIconButton>
        <HeaderIconButton
          label={translateLabel}
          accent
          active={translating}
          disabled={!canTranslate || translating}
          onClick={onTranslate}
        >
          <IconTranslate size={16} className={translating ? 'tm-icon-spin' : undefined} />
        </HeaderIconButton>
        <HeaderIconButton
          label={t('translationPage.settingsTitle', { title: config.title })}
          onClick={onOpenSettings}
        >
          <IconSliders size={16} />
        </HeaderIconButton>
      </div>
    </header>
  )
}
