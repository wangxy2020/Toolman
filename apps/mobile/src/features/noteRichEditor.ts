import { stripSocraticMachineBlocks } from '@toolman/shared'

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
  const wikiSlots: string[] = []
  let work = line.replace(/<u>([\s\S]*?)<\/u>/gi, (_, inner: string) => {
    const token = `\u0000U${underlineSlots.length}\u0000`
    underlineSlots.push(`<u>${escapeHtml(inner)}</u>`)
    return token
  })
  work = work.replace(
    /<span\s+style=["']font-size:\s*([^"']+)["']>([\s\S]*?)<\/span>/gi,
    (_, size: string, inner: string) => {
      const token = `\u0000F${fontSlots.length}\u0000`
      fontSlots.push(
        `<span style="font-size: ${escapeHtml(size.trim())}">${escapeHtml(inner)}</span>`,
      )
      return token
    },
  )
  work = work.replace(/\[\[([^[\]]+)\]\]/g, (_, raw: string) => {
    const [targetRaw, labelRaw] = raw.split('|').map((part: string) => part.trim())
    const target = targetRaw ?? ''
    const label = labelRaw || target
    const token = `\u0000W${wikiSlots.length}\u0000`
    wikiSlots.push(`<span data-wiki="${escapeHtml(target)}">${escapeHtml(label)}</span>`)
    return token
  })

  work = escapeHtml(work)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
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
  wikiSlots.forEach((html, index) => {
    work = work.replace(`\u0000W${index}\u0000`, html)
  })

  return work
}

function isListLine(line: string): boolean {
  return /^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line) || /^- \[[ xX]\]\s+/.test(line)
}

/** Convert stored Markdown into editor HTML so source markers stay hidden. */
export function markdownToEditorHtml(markdown: string): string {
  const source = stripSocraticMachineBlocks(markdown)
  if (!source) return ''

  const lines = source.split('\n')
  const parts: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''

    if (line.trimStart().startsWith('```')) {
      const language = line.trim().slice(3).trim()
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index]?.trimStart().startsWith('```')) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) index += 1
      if (/^socratic-(?:card|state)$/i.test(language)) continue
      const code = escapeHtml(codeLines.join('\n'))
      const langAttr = language ? ` data-language="${escapeHtml(language)}"` : ''
      parts.push(`<pre${langAttr}><code>${code}</code></pre>`)
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
        const task = current.match(/^- \[([ xX])\]\s*(.*)$/)
        if (task && !ordered) {
          const checked = task[1]?.toLowerCase() === 'x' ? 'x' : ' '
          items.push(`<li data-task="${checked}">${applyInlineMarkdown(task[2] ?? '')}</li>`)
        } else {
          const text = current.replace(/^(\d+\.\s+|[-*+]\s+)/, '')
          items.push(`<li>${applyInlineMarkdown(text)}</li>`)
        }
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
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
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
      const wiki = el.getAttribute('data-wiki')
      if (wiki != null) {
        const label = inner.trim()
        return label && label !== wiki ? `[[${wiki}|${label}]]` : `[[${wiki}]]`
      }
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

function serializeBlock(el: HTMLElement): string {
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
        if (!(li instanceof HTMLElement) || li.tagName !== 'LI') continue
        const task = li.getAttribute('data-task')
        const body = serializeBlock(li)
        lines.push(task === 'x' || task === ' ' ? `- [${task}] ${body}` : `- ${body}`)
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

export function richEditorIsEmpty(root: HTMLElement): boolean {
  return !editorHtmlToMarkdown(root).trim()
}
