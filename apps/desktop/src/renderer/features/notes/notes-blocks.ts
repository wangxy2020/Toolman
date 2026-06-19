import {
  createNoteBlockId,
  type NoteBlock,
  type NoteBlockType,
} from './notes-storage'

const LINE_PREFIX: Record<Exclude<NoteBlockType, 'paragraph' | 'code' | 'divider'>, string> = {
  h1: '# ',
  h2: '## ',
  h3: '### ',
  bullet: '- ',
  ordered: '1. ',
  quote: '> ',
  task: '- [ ] ',
}

export function markdownToBlocks(markdown: string): NoteBlock[] {
  const lines = markdown.split('\n')
  const blocks: NoteBlock[] = []
  let codeBuffer: string[] | null = null

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (codeBuffer) {
        blocks.push({
          id: createNoteBlockId(),
          type: 'code',
          text: codeBuffer.join('\n'),
        })
        codeBuffer = null
      } else {
        codeBuffer = []
      }
      continue
    }

    if (codeBuffer) {
      codeBuffer.push(line)
      continue
    }

    if (line.trim() === '---') {
      blocks.push({ id: createNoteBlockId(), type: 'divider', text: '' })
      continue
    }

    const taskMatch = line.match(/^- \[( |x|X)\] (.*)$/)
    if (taskMatch) {
      blocks.push({
        id: createNoteBlockId(),
        type: 'task',
        text: taskMatch[2] ?? '',
        checked: taskMatch[1]?.toLowerCase() === 'x',
      })
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push({ id: createNoteBlockId(), type: 'h3', text: line.slice(4) })
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ id: createNoteBlockId(), type: 'h2', text: line.slice(3) })
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push({ id: createNoteBlockId(), type: 'h1', text: line.slice(2) })
      continue
    }
    if (line.startsWith('> ')) {
      blocks.push({ id: createNoteBlockId(), type: 'quote', text: line.slice(2) })
      continue
    }
    if (line.match(/^[-*+] /)) {
      blocks.push({ id: createNoteBlockId(), type: 'bullet', text: line.replace(/^[-*+] /, '') })
      continue
    }
    if (line.match(/^\d+\. /)) {
      blocks.push({ id: createNoteBlockId(), type: 'ordered', text: line.replace(/^\d+\. /, '') })
      continue
    }

    if (line.trim() === '' && blocks.length === 0) continue
    blocks.push({ id: createNoteBlockId(), type: 'paragraph', text: line })
  }

  if (codeBuffer) {
    blocks.push({ id: createNoteBlockId(), type: 'code', text: codeBuffer.join('\n') })
  }

  return blocks.length > 0
    ? blocks
    : [{ id: createNoteBlockId(), type: 'paragraph', text: '' }]
}

export function blocksToMarkdown(blocks: NoteBlock[]): string {
  let orderedIndex = 1
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'bullet':
        case 'quote':
          orderedIndex = 1
          return `${LINE_PREFIX[block.type]}${block.text}`
        case 'ordered': {
          const line = `${orderedIndex}. ${block.text}`
          orderedIndex += 1
          return line
        }
        case 'task':
          orderedIndex = 1
          return `- [${block.checked ? 'x' : ' '}] ${block.text}`
        case 'code':
          orderedIndex = 1
          return `\`\`\`\n${block.text}\n\`\`\``
        case 'divider':
          orderedIndex = 1
          return '---'
        default:
          orderedIndex = 1
          return block.text
      }
    })
    .join('\n')
}

export function createDefaultBlocks(): NoteBlock[] {
  return [{ id: createNoteBlockId(), type: 'paragraph', text: '' }]
}
