const bodyFontSize = 19;
const bodyLineHeight = 28;
const averageCharacterWidth = bodyFontSize * 0.43;
const textBottomPadding = 24;

function wrapParagraph(paragraph: string, maxCharacters: number): string[] {
  const words = paragraph.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) {
        lines.push(line);
        line = '';
      }

      for (let offset = 0; offset < word.length; offset += maxCharacters) {
        const part = word.slice(offset, offset + maxCharacters);
        if (part.length === maxCharacters) {
          lines.push(part);
        } else {
          line = part;
        }
      }
      continue;
    }

    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = nextLine;
    }
  }

  if (line) lines.push(line);
  return lines;
}

export function paginateChapterText(
  text: string,
  title: string,
  width: number,
  height: number,
): string[] {
  const horizontalPadding = 52;
  const pageVerticalPadding = 12 + 10;
  const safetyLines = 3;
  const verticalPadding =
    pageVerticalPadding + textBottomPadding + bodyLineHeight * safetyLines;
  const contentWidth = Math.max(width - horizontalPadding, bodyFontSize * 8);
  const maxCharacters = Math.max(
    12,
    Math.floor(contentWidth / averageCharacterWidth),
  );
  const maxLines = Math.max(
    1,
    Math.floor((height - verticalPadding) / bodyLineHeight),
  );
  const titleCharactersPerLine = Math.max(
    12,
    Math.floor(contentWidth / (24 * 0.56)),
  );
  const titleLines = Math.max(1, Math.ceil(title.length / titleCharactersPerLine));
  const firstPageLines = Math.max(1, maxLines - titleLines - 2);
  const logicalLines = text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph, index, paragraphs) => [
      ...wrapParagraph(paragraph, maxCharacters),
      ...(index < paragraphs.length - 1 ? [''] : []),
    ]);

  if (logicalLines.length === 0) return [''];

  const pages: string[] = [];
  let offset = 0;

  while (offset < logicalLines.length) {
    const capacity = pages.length === 0 ? firstPageLines : maxLines;
    const pageLines = logicalLines.slice(offset, offset + capacity);
    offset += capacity;
    while (pageLines[0] === '') pageLines.shift();
    while (pageLines[pageLines.length - 1] === '') pageLines.pop();
    if (pageLines.length > 0) pages.push(pageLines.join('\n'));
  }

  return pages.length > 0 ? pages : [''];
}
