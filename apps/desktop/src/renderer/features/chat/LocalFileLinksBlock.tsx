import { LocalFilePathLink } from './LocalFilePathLink'

interface Props {
  title?: string
  paths: string[]
  compact?: boolean
}

export function LocalFileLinksBlock({ title, paths, compact = false }: Props) {
  const uniquePaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  if (uniquePaths.length === 0) return null

  const openLabel = uniquePaths.every((path) => /\.xlsx?$/i.test(path))
    ? '用 Excel 打开'
    : uniquePaths.every((path) => /\.docx?$/i.test(path))
      ? '用 Word 打开'
      : '打开文件'

  const sectionTitle = title?.trim() || '生成的文件'

  if (compact) {
    return (
      <section className="tm-local-file-links tm-local-file-links--compact">
        <div className="tm-local-file-links-items">
          {uniquePaths.map((path) => (
            <LocalFilePathLink
              key={`open-${path}`}
              path={path}
              action="open"
              className="tm-tool-office-path-link--inline"
            />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="tm-local-file-links">
      <div className="tm-local-file-links-section">
        <h3 className="tm-local-file-links-title">{sectionTitle}（点击在 Finder 中显示）</h3>
        <div className="tm-local-file-links-items">
          {uniquePaths.map((path) => (
            <LocalFilePathLink key={`reveal-${path}`} path={path} action="reveal" showFullPath />
          ))}
        </div>
      </div>

      <div className="tm-local-file-links-section">
        <h3 className="tm-local-file-links-title">{openLabel}</h3>
        <div className="tm-local-file-links-items">
          {uniquePaths.map((path) => (
            <LocalFilePathLink key={`open-${path}`} path={path} action="open" />
          ))}
        </div>
      </div>
    </section>
  )
}
