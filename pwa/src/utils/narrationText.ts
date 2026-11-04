import type { NarrationChunk } from '../types'

type PageParagraph = { text: string; continues: boolean; complete: boolean }
export type NarrationSourceRange = { paragraphIndex: number; start: number; end: number }
export type NarrationPageFragment = { paragraphIndex: number; sourceOffsets: number[] }
type Passage = {
  text: string
  paragraphIndex: number
  offset: number
  sourceRanges: NarrationSourceRange[]
}

export function indexNarrationPages(
  paragraphs: string[],
  pages: PageParagraph[][],
): NarrationPageFragment[][] {
  const sources = paragraphs.map((text) => text.replace(/\s+/g, ' ').trim())
  let paragraphIndex = 0
  let offset = 0
  return pages.map((page) => page.map((paragraph) => {
    while (paragraphIndex < sources.length && !sources[paragraphIndex]) paragraphIndex += 1
    const source = sources[paragraphIndex] ?? ''
    if (source[offset] === ' ') offset += 1
    const sourceOffsets = [offset]
    for (const character of paragraph.text) {
      if (/\s/.test(character)) {
        // A wrapped newline either replaces a space or splits an overlong word.
        if (source[offset] === ' ') offset += 1
        sourceOffsets.push(offset)
      } else {
        for (let unit = 0; unit < character.length; unit += 1) {
          offset += 1
          sourceOffsets.push(offset)
        }
      }
    }
    const fragment = { paragraphIndex, sourceOffsets }
    if (paragraph.complete) {
      paragraphIndex += 1
      offset = 0
    }
    return fragment
  }))
}

export function createNarrationChunks(
  paragraphs: string[],
  pages: PageParagraph[][],
  fragments = indexNarrationPages(paragraphs, pages),
): (NarrationChunk & { sourceRanges: NarrationSourceRange[] })[] {
  const passages: Passage[] = []
  let current: Passage | undefined
  let lastParagraphIndex = -1
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const text = paragraph.replace(/\s+/g, ' ').trim()
    for (const sentence of segmenter.segment(text)) {
      let remaining = sentence.segment.trim()
      let offset = sentence.index + sentence.segment.length - sentence.segment.trimStart().length
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
        else current = { text: part, paragraphIndex, offset, sourceRanges: [] }
        const previousRange = current.sourceRanges.at(-1)
        if (previousRange?.paragraphIndex === paragraphIndex) {
          previousRange.end = offset + part.length
        } else {
          current.sourceRanges.push({ paragraphIndex, start: offset, end: offset + part.length })
        }
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
  fragments.forEach((page, pageIndex) => {
    for (const fragment of page) {
      positions.push({ paragraphIndex: fragment.paragraphIndex, offset: fragment.sourceOffsets[0], pageIndex })
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
    return {
      text: passage.text,
      pageIndex: positions[positionIndex]?.pageIndex ?? 0,
      sourceRanges: passage.sourceRanges,
    }
  })
}

export function findNarrationStart(chunks: NarrationChunk[], page: number): number {
  const index = chunks.findIndex((chunk) => chunk.pageIndex >= page)
  if (index < 0) return Math.max(0, chunks.length - 1)
  return chunks[index].pageIndex === page ? index : Math.max(0, index - 1)
}
