import { IconPanelLeft, IconSearch } from '../icons'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  sidebarVisible: boolean
  onToggleSidebar: () => void
  searchTitle?: string
  searchEnabled?: boolean
  onOpenSearch?: () => void
}

/** 与系统窗口控制同一行的顶栏：左侧为隐藏分栏，右侧为搜索（按页面接入） */
export function WindowChromeBar({
  sidebarVisible,
  onToggleSidebar,
  searchTitle,
  searchEnabled = true,
  onOpenSearch,
}: Props) {
  const { t } = useI18n()
  const resolvedSearchTitle = searchTitle ?? t('nav.search')
  const sidebarTitle = sidebarVisible ? t('sidebar.hide') : t('sidebar.show')

  return (
    <header className="tm-window-chrome">
      <div className="tm-window-chrome-leading">
        <button
          type="button"
          className="tm-window-chrome-btn"
          title={sidebarTitle}
          aria-label={sidebarTitle}
          onClick={onToggleSidebar}
        >
          <IconPanelLeft collapsed={!sidebarVisible} />
        </button>
      </div>

      <div className="tm-window-chrome-fill" />

      <div className="tm-window-chrome-trailing">
        {searchEnabled && onOpenSearch ? (
          <button
            type="button"
            className="tm-window-chrome-btn"
            title={resolvedSearchTitle}
            aria-label={resolvedSearchTitle}
            onClick={onOpenSearch}
          >
            <IconSearch />
          </button>
        ) : null}
      </div>
    </header>
  )
}
