import { useEffect, useState, type FormEvent } from 'react'
import {
  IconArrowLeftRight,
  IconClear,
  IconDownload,
  IconExternalLink,
  IconParse,
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
  parsing: boolean
  canTranslate: boolean
  canParse: boolean
  canSave: boolean
  canSaveToNotes?: boolean
  canOpenExternally?: boolean
  documentTotalPages?: number
  documentCurrentPage?: number
  onSave: () => void
  onSaveToNotes?: () => void
  onSwapLanguages: () => void
  onParse: () => void
  onTranslate: () => void
  onClear: () => void
  onOpenSettings: () => void
  onOpenExternally?: () => void
  onJumpToPage?: (pageNumber: number) => void
}

function TranslationDocumentPageJump({
  totalPages,
  currentPage,
  onJumpToPage,
}: {
  totalPages: number
  currentPage: number
  onJumpToPage: (pageNumber: number) => void
}) {
  const { t } = useI18n()
  const [value, setValue] = useState(String(currentPage))
  const enterHint = t('translationPage.documents.pageJumpEnterHint')

  useEffect(() => {
    setValue(String(currentPage))
  }, [currentPage, totalPages])

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const page = Number.parseInt(value, 10)
    if (!Number.isFinite(page) || page < 1 || page > totalPages) return
    onJumpToPage(page)
  }

  return (
    <form className="tm-translation-page-jump" onSubmit={submit}>
      <label className="tm-translation-page-jump-field" title={enterHint}>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="tm-translation-page-jump-input"
          aria-label={t('translationPage.documents.pageJumpLabel')}
          title={enterHint}
        />
        <span className="tm-translation-page-jump-total" title={enterHint}>
          {t('translationPage.documents.pageJumpOf', { total: String(totalPages) })}
        </span>
      </label>
    </form>
  )
}

export function TranslationPageHeader({
  section,
  sectionLabel,
  translating,
  parsing,
  canTranslate,
  canParse,
  canSave,
  canSaveToNotes = false,
  canOpenExternally = false,
  documentTotalPages = 0,
  documentCurrentPage = 1,
  onSave,
  onSaveToNotes,
  onSwapLanguages,
  onParse,
  onTranslate,
  onClear,
  onOpenSettings,
  onOpenExternally,
  onJumpToPage,
}: Props) {
  const { t } = useI18n()
  const config = getModulePageConfig('translate', t)
  const isDocuments = section === 'documents'
  const parseLabel = parsing
    ? t('translationPage.documents.parsePreviewStop')
    : t('translationPage.documents.parsePreview')
  const translateLabel = translating
    ? t('translationPage.documents.translateStop')
    : t('translationPage.workspace.translate')

  return (
    <header
      className={`tm-chat-header${isDocuments ? ' tm-chat-header--translation-doc' : ''}`}
    >
      <div className="tm-chat-breadcrumb">
        <span className="tm-model-pill tm-module-pill">{config.title}</span>
        <span className="tm-module-breadcrumb-group">
          <span className="tm-chat-breadcrumb-sep">/</span>
          <span className="tm-model-pill tm-module-pill tm-module-pill--secondary">{sectionLabel}</span>
        </span>
      </div>

      {isDocuments && documentTotalPages > 0 && onJumpToPage ? (
        <TranslationDocumentPageJump
          totalPages={documentTotalPages}
          currentPage={documentCurrentPage}
          onJumpToPage={onJumpToPage}
        />
      ) : null}

      <div className="tm-chat-header-end">
        {isDocuments && onSaveToNotes ? (
          <HeaderIconButton
            label={t('translationPage.documents.saveToNotes')}
            disabled={!canSaveToNotes}
            onClick={onSaveToNotes}
          >
            <IconSaveNote size={16} />
          </HeaderIconButton>
        ) : null}
        <HeaderIconButton
          label={
            isDocuments
              ? t('translationPage.documents.save')
              : t('translationPage.workspace.save')
          }
          disabled={!canSave}
          onClick={onSave}
        >
          {isDocuments ? <IconDownload size={16} /> : <IconSaveNote size={16} />}
        </HeaderIconButton>
        {isDocuments ? (
          <HeaderIconButton
            label={t('translationPage.documents.openExternally')}
            disabled={!canOpenExternally}
            onClick={onOpenExternally}
          >
            <IconExternalLink size={16} />
          </HeaderIconButton>
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
        {isDocuments ? (
            <HeaderIconButton
            label={parseLabel}
            active={parsing}
            disabled={!canParse || (translating && !parsing)}
            onClick={onParse}
          >
            <IconParse size={16} className={parsing ? 'tm-icon-spin' : undefined} />
          </HeaderIconButton>
        ) : null}
        <HeaderIconButton
          label={translateLabel}
          accent
          active={translating}
          disabled={!canTranslate || (parsing && !translating)}
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
