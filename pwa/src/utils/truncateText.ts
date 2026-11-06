export function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  const characters = Array.from(text);
  if (characters.length <= maxLength) return text;
  if (maxLength <= 1) return '…';
  return `${characters.slice(0, maxLength - 1).join('')}…`;
}
