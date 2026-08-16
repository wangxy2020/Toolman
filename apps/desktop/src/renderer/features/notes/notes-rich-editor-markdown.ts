/** Markdown ↔ contenteditable HTML for the notes rich editor. */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function applyInlineMarkdown(line: string): string {
  const underlineSlots: string[] = []
  const fontSlots: string[] = []
  let work = line.replace(/<u>([\s\S]*?)<\/u>/gi, (_, inner: string) => {
    const token = `\u0000U${underlineSlots.length}\u0000`
    underlineSlots.push(`<u>${escapeHtml(inner)}</u>`)
    return token
  })
  work = work.replace(
    /<span\s+style=["']font-size:\s*([^"']+)["']>([\s\S]*?)<\/span>/gi,
    (_, size: string, inner: string) => {
      const token = `\u0000F${fontSlots.length}\u0000`
      fontSlots.push(`<span style="font-size: ${escapeHtml(size.trim())}">${escapeHtml(inner)}</span>`)
      return token
    },
  )

  work = escapeHtml(work)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')

  underlineSlots.forEach((html, index) => {
    work = work.replace(`\u0000U${index}\u0000`, html)
  })
  fontSlots.forEach((html, index) => {
    work = work.replace(`\u0000F${index}\u0000`, html)
  })

  return work
}

function isListLine(line: string): boolean {
  return /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line) || /^- \[[ xX]\]\s+/.test(line)
}

function listItemMarkdown(line: string): string {
  const task = line.match(/^- \[([ xX])\]\s+(.*)$/)
  if (task) {
    const checked = task[1]?.toLowerCase() === 'x' ? 'x' : ' '
    return `- [${checked}] ${applyInlineMarkdown(task[2] ?? '')}`
  }
  const bullet = line.match(/^[-*+]\s+(.*)$/)
  if (bullet) return applyInlineMarkdown(bullet[1] ?? '')
  const ordered = line.match(/^\d+\.\s+(.*)$/)
  if (ordered) return applyInlineMarkdown(ordered[1] ?? '')
  return applyInlineMarkdown(line)
}

export function markdownToEditorHtml(markdown: string): string {
  if (!markdown) return ''

  const lines = markdown.split('\n')
  const parts: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index]?.startsWith('```')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      const code = escapeHtml(codeLines.join('\n'))
      const langAttr = language ? ` data-language="${escapeHtml(language)}"` : ''
      parts.push(`<pre${langAttr}><code>${code}</code></pre>`)
      index += 1
      continue
    }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)?.[0].length ?? 1
      const tag = `h${Math.min(level, 3)}`
      const text = line.replace(/^#{1,3}\s+/, '')
      parts.push(`<${tag}>${applyInlineMarkdown(text)}</${tag}>`)
      index += 1
      continue
    }

    if (line.startsWith('> ')) {
      parts.push(`<blockquote><div>${applyInlineMarkdown(line.slice(2))}</div></blockquote>`)
      index += 1
      continue
    }

    if (isListLine(line)) {
      const ordered = /^\d+\.\s+/.test(line)
      const items: string[] = []
      while (index < lines.length && isListLine(lines[index] ?? '')) {
        const current = lines[index] ?? ''
        items.push(`<li>${listItemMarkdown(current.replace(/^(\d+\.\s+|[-*+]\s+|- \[[ xX]\]\s+)/, ''))}</li>`)
        index += 1
      }
      parts.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`)
      continue
    }

    if (!line.trim()) {
      parts.push('<div><br></div>')
      index += 1
      continue
    }

    parts.push(`<div>${applyInlineMarkdown(line)}</div>`)
    index += 1
  }

  return parts.join('')
}

function serializeInline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  const inner = Array.from(el.childNodes).map(serializeInline).join('')

  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return `**${inner}**`
    case 'EM':
    case 'I':
      return `*${inner}*`
    case 'U':
      return `<u>${inner}</u>`
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return `~~${inner}~~`
    case 'CODE':
      return `\`${inner}\``
    case 'BR':
      return '\n'
    case 'A': {
      const href = el.getAttribute('href') ?? ''
      return `[${inner}](${href})`
    }
    case 'IMG': {
      const src = el.getAttribute('src') ?? ''
      const alt = el.getAttribute('alt') ?? '图片'
      return `![${alt}](${src})`
    }
    case 'SPAN': {
      const fontSize = el.style.fontSize?.trim()
      if (fontSize) return `<span style="font-size: ${fontSize}">${inner}</span>`
      return inner
    }
    default:
      return inner
  }
}

function isBlankBlock(el: HTMLElement): boolean {
  if ((el.textContent ?? '').replace(/\u00a0/g, '').trim()) return false
  const children = Array.from(el.childNodes)
  return (
    children.length === 0 ||
    children.every(
      (node) =>
        node.nodeType === Node.ELEMENT_NODE &&
        ['BR', 'WBR'].includes((node as HTMLElement).tagName),
    )
  )
}

export function serializeBlock(el: HTMLElement): string {
  const tag = el.tagName
  const inline = Array.from(el.childNodes).map(serializeInline).join('')

  if (tag === 'H1') return `# ${inline}`
  if (tag === 'H2') return `## ${inline}`
  if (tag === 'H3') return `### ${inline}`
  if (tag === 'BLOCKQUOTE') {
    const line = Array.from(el.querySelectorAll('div, p'))
      .map((node) => Array.from(node.childNodes).map(serializeInline).join(''))
      .join('\n')
    return `> ${line || inline}`
  }
  if (tag === 'LI') return inline
  if (tag === 'PRE') {
    const code = el.querySelector('code')
    const language = el.getAttribute('data-language')?.trim()
    const body = code?.textContent ?? el.textContent ?? ''
    return language ? `\`\`\`${language}\n${body}\n\`\`\`` : `\`\`\`\n${body}\n\`\`\``
  }
  if (tag === 'DIV' || tag === 'P') {
    if (isBlankBlock(el)) return ''
    return inline
  }
  return inline
}

export function normalizeEditorMarkdown(markdown: string): string {
  const lines = markdown.split('\n')
  const normalized: string[] = []
  let blankRun = 0

  for (const line of lines) {
    if (!line.trim()) {
      blankRun += 1
      if (blankRun <= 1) normalized.push('')
      continue
    }
    blankRun = 0
    normalized.push(line)
  }

  return normalized.join('\n').replace(/^\n+/, '')
}

export function editorHtmlToMarkdown(root: HTMLElement): string {
  const lines: string[] = []

  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text.trim()) lines.push(text)
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue

    const el = child as HTMLElement
    if (el.tagName === 'UL') {
      for (const li of Array.from(el.children)) {
        if (li instanceof HTMLElement) lines.push(`- ${serializeBlock(li)}`)
      }
      continue
    }
    if (el.tagName === 'OL') {
      Array.from(el.children).forEach((li, index) => {
        if (li instanceof HTMLElement) lines.push(`${index + 1}. ${serializeBlock(li)}`)
      })
      continue
    }
    lines.push(serializeBlock(el))
  }

  return normalizeEditorMarkdown(lines.join('\n'))
}
