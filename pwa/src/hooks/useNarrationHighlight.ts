import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import type {
  NarrationPageFragment,
  NarrationSourceRange,
} from '../utils/narrationText';
import {
  getNarrationHighlightOffsets,
  narrationHighlightName,
  supportsNarrationHighlight,
} from '../utils/narrationHighlight';

export function useNarrationHighlight(
  viewportRef: RefObject<HTMLDivElement | null>,
  fragments: NarrationPageFragment[][],
  sourceRanges: NarrationSourceRange[] | null
) {
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !supportsNarrationHighlight() || !sourceRanges) return;

    const highlight = new Highlight();
    const update = () => {
      highlight.clear();
      // Page-flip may clone or replace pages; highlight each matching live text node.
      for (const element of viewport.querySelectorAll<HTMLElement>(
        '[data-reading-fragment]'
      )) {
        const [page, paragraph] = (element.dataset.readingFragment ?? '')
          .split(':')
          .map(Number);
        const fragment = fragments[page]?.[paragraph];
        const text = element.firstChild;
        if (!fragment || !(text instanceof Text)) continue;
        for (const { start, end } of getNarrationHighlightOffsets(
          fragment,
          sourceRanges
        )) {
          const range = document.createRange();
          range.setStart(text, start);
          range.setEnd(text, end);
          highlight.add(range);
        }
      }
      CSS.highlights.set(narrationHighlightName, highlight);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(viewport, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      if (CSS.highlights.get(narrationHighlightName) === highlight) {
        CSS.highlights.delete(narrationHighlightName);
      }
    };
  }, [viewportRef, fragments, sourceRanges]);
}
