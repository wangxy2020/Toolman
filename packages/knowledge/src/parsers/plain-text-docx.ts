import { writeFileSync } from 'node:fs'
import JSZip from 'jszip'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildDocumentXml(paragraphs: string[]): string {
  const body = paragraphs
    .map((paragraph) => {
      const text = escapeXml(paragraph)
      return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr/></w:body>
</w:document>`
}

/** 将纯文本写入最小可用的 .docx（仅保留段落结构，不含原格式） */
export async function writePlainTextDocx(outputPath: string, plainText: string): Promise<void> {
  const paragraphs = plainText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
  if (paragraphs.length === 0 || paragraphs.every((line) => !line.trim())) {
    throw new Error('无法从源文件提取文本以生成 docx')
  }

  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  zip.folder('word')?.file('document.xml', buildDocumentXml(paragraphs))
  zip.folder('word')?.folder('_rels')?.file(
    'document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
  )

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  writeFileSync(outputPath, buffer)
}
