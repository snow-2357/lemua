import type { NarrationPageFragment, NarrationSourceRange } from './narrationText'

export const narrationHighlightName = 'lemua-narration'

export function supportsNarrationHighlight(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined'
}

export function getNarrationHighlightOffsets(
  fragment: NarrationPageFragment,
  sourceRanges: NarrationSourceRange[],
): { start: number; end: number }[] {
  const offsets = fragment.sourceOffsets
  return sourceRanges.flatMap((sourceRange) => {
    if (sourceRange.paragraphIndex !== fragment.paragraphIndex ||
      sourceRange.end <= offsets[0] || sourceRange.start >= offsets[offsets.length - 1]) return []
    const start = offsets.findIndex((offset) => offset >= sourceRange.start)
    const end = offsets.findLastIndex((offset) => offset <= sourceRange.end)
    return end > start ? [{ start: Math.max(0, start), end }] : []
  })
}
