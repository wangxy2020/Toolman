import { LocalFilePathLink } from './LocalFilePathLink'

interface Props {
  title?: string
  paths: string[]
}

export function LocalFileLinksBlock({ paths }: Props) {
  const uniquePaths = [...new Set(paths.map((path) => path.trim()).filter(Boolean))]
  if (uniquePaths.length === 0) return null

  return (
    <section className="tm-local-file-links">
      <div className="tm-local-file-links-section">
        <h3 className="tm-local-file-links-title">修订版路径（点击在 Finder 中显示）</h3>
        <div className="tm-local-file-links-items">
          {uniquePaths.map((path) => (
            <LocalFilePathLink key={`reveal-${path}`} path={path} action="reveal" showFullPath />
          ))}
        </div>
      </div>

      <div className="tm-local-file-links-section">
        <h3 className="tm-local-file-links-title">用 Word 打开</h3>
        <div className="tm-local-file-links-items">
          {uniquePaths.map((path) => (
            <LocalFilePathLink key={`open-${path}`} path={path} action="open" />
          ))}
        </div>
      </div>
    </section>
  )
}
