import type { NarrationChunk } from '../types'

type PageParagraph = { text: string; continues: boolean; complete: boolean }
type Passage = { text: string; paragraphIndex: number; offset: number }

export function createNarrationChunks(
  paragraphs: string[],
  pages: PageParagraph[][],
): NarrationChunk[] {
  const passages: Passage[] = []
  let current: Passage | undefined
  let lastParagraphIndex = -1
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const text = paragraph.replace(/\s+/g, ' ').trim()
    for (const sentence of segmenter.segment(text)) {
      let remaining = sentence.segment.trim()
      let offset = sentence.index
      while (remaining) {
        const limit = passages.length === 0 ? 240 : 480
        let length = Math.min(remaining.length, limit)
        if (length < remaining.length) {
          const space = remaining.lastIndexOf(' ', length)
          if (space > 0) length = space
        }
        const part = remaining.slice(0, length)
        const separator = lastParagraphIndex === paragraphIndex ? ' ' : '\n\n'
        if (current && current.text.length + separator.length + part.length > limit) {
          passages.push(current)
          current = undefined
          continue
        }
        if (current) current.text += separator + part
        else current = { text: part, paragraphIndex, offset }
        lastParagraphIndex = paragraphIndex
        const consumed = remaining.length - remaining.slice(length).trimStart().length
        remaining = remaining.slice(length).trimStart()
        offset += consumed
        if (current.text.length >= (passages.length === 0 ? 160 : 320)) {
          passages.push(current)
          current = undefined
        }
      }
    }
  })
  if (current) passages.push(current)

  const positions: { paragraphIndex: number; offset: number; pageIndex: number }[] = []
  let paragraphIndex = 0
  let offset = 0
  pages.forEach((page, pageIndex) => {
    for (const paragraph of page) {
      positions.push({ paragraphIndex, offset, pageIndex })
      offset += paragraph.text.replace(/\s+/g, ' ').trim().length + 1
      if (paragraph.complete) {
        paragraphIndex += 1
        offset = 0
      }
    }
  })
  let positionIndex = 0
  return passages.map((passage) => {
    while (positionIndex + 1 < positions.length) {
      const next = positions[positionIndex + 1]
      if (next.paragraphIndex > passage.paragraphIndex ||
        (next.paragraphIndex === passage.paragraphIndex && next.offset > passage.offset)) break
      positionIndex += 1
    }
    return { text: passage.text, pageIndex: positions[positionIndex]?.pageIndex ?? 0 }
  })
}

export function findNarrationStart(chunks: NarrationChunk[], page: number): number {
  const index = chunks.findIndex((chunk) => chunk.pageIndex >= page)
  if (index < 0) return Math.max(0, chunks.length - 1)
  return chunks[index].pageIndex === page ? index : Math.max(0, index - 1)
}
