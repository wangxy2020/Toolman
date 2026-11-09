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
  const imageSlots: string[] = []
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
  work = work.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, url: string) => {
    const token = `\u0000I${imageSlots.length}\u0000`
    const safeAlt = escapeHtml(alt || '图片')
    const safeUrl = escapeHtml(url)
    let filePathAttr = ''
    if (!url.startsWith('data:')) {
      let path = url
      if (url.startsWith('file:')) {
        try {
          path = decodeURIComponent(new URL(url).pathname)
          if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1)
        } catch {
          path = url.replace(/^file:\/\//, '')
        }
      }
      filePathAttr = ` data-file-path="${escapeHtml(path)}"`
    }
    imageSlots.push(
      `<img class="tm-notes-rich-image" alt="${safeAlt}" src="${safeUrl}"${filePathAttr}>`,
    )
    return token
  })

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
  imageSlots.forEach((html, index) => {
    work = work.replace(`\u0000I${index}\u0000`, html)
  })

  return work
}

function isTaskLine(line: string): boolean {
  return /^- \[[ xX]\](?:\s+|$)/.test(line)
}

function isOrderedTaskLine(line: string): boolean {
  return /^\d+\.\s+\[[ xX]\](?:\s+|$)/.test(line)
}

function isBulletLine(line: string): boolean {
  return /^[-*+]\s+/.test(line) && !isTaskLine(line)
}

function isOrderedLine(line: string): boolean {
  return /^\d+\.\s+/.test(line)
}

function isBulletOrTaskLine(line: string): boolean {
  return isTaskLine(line) || isBulletLine(line)
}

function parseTaskMarker(raw: string | undefined): { checked: boolean; text: string } {
  const match = (raw ?? '').match(/^\[([ xX])\](?:\s+(.*))?$/)
  if (!match) return { checked: false, text: raw ?? '' }
  return {
    checked: match[1]?.toLowerCase() === 'x',
    text: match[2] ?? '',
  }
}

function isTableRowLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line)
}

function isTableSeparatorLine(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

/** Span-based checkboxes survive contentEditable innerHTML; real <input> gets stripped. */
function buildTaskItemHtml(checked: boolean, textHtml: string): string {
  const checkedAttr = checked ? 'true' : 'false'
  return [
    `<li class="tm-notes-task-item" data-checked="${checkedAttr}">`,
    `<span class="tm-notes-task-check" role="checkbox" aria-checked="${checkedAttr}" contenteditable="false"></span>`,
    `<span class="tm-notes-task-text">${textHtml || '<br>'}</span>`,
    '</li>',
  ].join('')
}

function listItemMarkdown(line: string): string {
  const bullet = line.match(/^[-*+]\s+(.*)$/)
  if (bullet) return applyInlineMarkdown(bullet[1] ?? '')
  const ordered = line.match(/^\d+\.\s+(.*)$/)
  if (ordered) return applyInlineMarkdown(ordered[1] ?? '')
  return applyInlineMarkdown(line)
}

function renderMarkdownTable(header: string[], rows: string[][]): string {
  const head = header
    .map((cell) => `<th>${applyInlineMarkdown(cell)}</th>`)
    .join('')
  const body = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${applyInlineMarkdown(cell)}</td>`).join('')}</tr>`,
    )
    .join('')
  return `<table class="tm-notes-rich-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
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

    if (
      isTableRowLine(line) &&
      index + 1 < lines.length &&
      isTableSeparatorLine(lines[index + 1] ?? '')
    ) {
      const header = splitTableCells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && isTableRowLine(lines[index] ?? '')) {
        rows.push(splitTableCells(lines[index] ?? ''))
        index += 1
      }
      parts.push(renderMarkdownTable(header, rows))
      continue
    }

    if (isOrderedLine(line)) {
      const items: string[] = []
      while (index < lines.length && isOrderedLine(lines[index] ?? '')) {
        const current = lines[index] ?? ''
        if (isOrderedTaskLine(current)) {
          const body = current.replace(/^\d+\.\s+/, '')
          const { checked, text } = parseTaskMarker(body)
          items.push(buildTaskItemHtml(checked, applyInlineMarkdown(text)))
        } else {
          items.push(`<li>${listItemMarkdown(current)}</li>`)
        }
        index += 1
      }
      parts.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    if (isBulletOrTaskLine(line)) {
      const collected: Array<{ task: boolean; html: string; checked?: boolean; textHtml?: string }> =
        []
      while (index < lines.length && isBulletOrTaskLine(lines[index] ?? '')) {
        const current = lines[index] ?? ''
        if (isTaskLine(current)) {
          const match = current.match(/^- \[([ xX])\](?:\s+(.*))?$/)
          collected.push({
            task: true,
            html: '',
            checked: match?.[1]?.toLowerCase() === 'x',
            textHtml: applyInlineMarkdown(match?.[2] ?? ''),
          })
        } else {
          collected.push({ task: false, html: `<li>${listItemMarkdown(current)}</li>` })
        }
        index += 1
      }
      const allTasks = collected.length > 0 && collected.every((item) => item.task)
      if (allTasks) {
        parts.push(
          `<ul class="tm-notes-task-list" data-task-list="true">${collected
            .map((item) => buildTaskItemHtml(Boolean(item.checked), item.textHtml ?? ''))
            .join('')}</ul>`,
        )
      } else {
        parts.push(
          `<ul>${collected
            .map((item) =>
              item.task
                ? buildTaskItemHtml(Boolean(item.checked), item.textHtml ?? '')
                : item.html,
            )
            .join('')}</ul>`,
        )
      }
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
  if (el.tagName === 'INPUT') return ''
  if (el.classList.contains('tm-notes-task-check')) return ''
  if (el.classList.contains('tm-notes-task-marker')) return ''
  if (el.tagName === 'LABEL') {
    const span = el.querySelector(':scope > .tm-notes-task-text, :scope > span:not(.tm-notes-task-check)')
    if (span) return Array.from(span.childNodes).map(serializeInline).join('')
  }
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
      const alt = el.getAttribute('alt') ?? '图片'
      const filePath = el.getAttribute('data-file-path')?.trim()
      const src = el.getAttribute('src') ?? ''
      if (filePath) {
        const href = filePath.startsWith('file:')
          ? filePath
          : filePath.startsWith('/')
            ? `file://${filePath}`
            : `file:///${filePath.replace(/\\/g, '/')}`
        return `![${alt}](${href})`
      }
      if (src.startsWith('data:')) return `![${alt}](${src})`
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

function serializeTable(el: HTMLElement): string {
  const rows = Array.from(el.querySelectorAll('tr'))
  if (rows.length === 0) return ''
  const cellsFor = (row: Element) =>
    Array.from(row.querySelectorAll('th,td')).map((cell) =>
      Array.from(cell.childNodes).map(serializeInline).join('').trim(),
    )
  const header = cellsFor(rows[0]!)
  if (header.length === 0) return ''
  const separator = header.map(() => '---')
  const body = rows.slice(1).map(cellsFor)
  const format = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [format(header), format(separator), ...body.map(format)].join('\n')
}

/** Checkbox + text only (callers add `-` / `1.` list markers). */
function serializeTaskItemBody(li: HTMLElement): string {
  const check = li.querySelector('.tm-notes-task-check')
  const checked =
    li.getAttribute('data-checked') === 'true' ||
    check?.getAttribute('aria-checked') === 'true' ||
    Boolean((li.querySelector('input[type="checkbox"]') as HTMLInputElement | null)?.checked)
  const textSpan = li.querySelector('.tm-notes-task-text')
  const text = textSpan
    ? Array.from(textSpan.childNodes).map(serializeInline).join('')
    : Array.from(li.childNodes)
        .filter(
          (node) =>
            !(
              node instanceof HTMLElement &&
              (node.classList.contains('tm-notes-task-check') ||
                node.classList.contains('tm-notes-task-marker') ||
                node.tagName === 'INPUT')
            ),
        )
        .map(serializeInline)
        .join('')
  return `[${checked ? 'x' : ' '}] ${text.trim()}`
}

function serializeTaskItem(li: HTMLElement, marker = '-'): string {
  return `${marker} ${serializeTaskItemBody(li)}`
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
  if (tag === 'LI') {
    if (el.classList.contains('tm-notes-task-item') || el.closest('[data-task-list="true"]')) {
      // No list marker here — UL/OL callers prefix `-` / `1.`
      return serializeTaskItemBody(el)
    }
    return inline
  }
  if (tag === 'PRE') {
    const code = el.querySelector('code')
    const language = el.getAttribute('data-language')?.trim()
    const body = code?.textContent ?? el.textContent ?? ''
    return language ? `\`\`\`${language}\n${body}\n\`\`\`` : `\`\`\`\n${body}\n\`\`\``
  }
  if (tag === 'TABLE') return serializeTable(el)
  if (tag === 'DIV' || tag === 'P') {
    // Contenteditable may nest block inserts inside a div; unwrap known blocks.
    const nestedBlocks = Array.from(el.children).filter(
      (child) =>
        child instanceof HTMLElement &&
        (child.tagName === 'TABLE' ||
          (child.tagName === 'UL' && child.getAttribute('data-task-list') === 'true') ||
          child.tagName === 'UL' ||
          child.tagName === 'OL' ||
          child.tagName === 'PRE'),
    ) as HTMLElement[]
    if (nestedBlocks.length > 0) {
      return nestedBlocks
        .map((child) => {
          if (child.tagName === 'TABLE') return serializeTable(child)
          if (child.tagName === 'UL' && child.getAttribute('data-task-list') === 'true') {
            return Array.from(child.children)
              .filter((li): li is HTMLElement => li instanceof HTMLElement)
              .map((li) => serializeTaskItem(li, '-'))
              .join('\n')
          }
          if (child.tagName === 'UL') {
            return Array.from(child.children)
              .filter((li): li is HTMLElement => li instanceof HTMLElement)
              .map((li) => `- ${serializeBlock(li)}`)
              .join('\n')
          }
          if (child.tagName === 'OL') {
            return Array.from(child.children)
              .filter((li): li is HTMLElement => li instanceof HTMLElement)
              .map((li, index) => `${index + 1}. ${serializeBlock(li)}`)
              .join('\n')
          }
          return serializeBlock(child)
        })
        .filter(Boolean)
        .join('\n')
    }
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
    if (el.tagName === 'UL' && el.getAttribute('data-task-list') === 'true') {
      for (const li of Array.from(el.children)) {
        if (li instanceof HTMLElement) lines.push(serializeTaskItem(li, '-'))
      }
      continue
    }
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
    if (el.tagName === 'TABLE') {
      const tableMarkdown = serializeTable(el)
      if (tableMarkdown) lines.push(tableMarkdown)
      continue
    }
    lines.push(serializeBlock(el))
  }

  return normalizeEditorMarkdown(lines.join('\n'))
}
