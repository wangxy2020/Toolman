import { IconPanelLeft, IconSearch } from '../icons'

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
  searchTitle = '搜索',
  searchEnabled = true,
  onOpenSearch,
}: Props) {
  return (
    <header className="tm-window-chrome">
      <div className="tm-window-chrome-leading">
        <button
          type="button"
          className="tm-window-chrome-btn"
          title={sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'}
          aria-label={sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'}
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
            title={searchTitle}
            aria-label={searchTitle}
            onClick={onOpenSearch}
          >
            <IconSearch />
          </button>
        ) : null}
      </div>
    </header>
  )
}
