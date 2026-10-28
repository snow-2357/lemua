export function formatBookTileTitle(title: string, maxLength = 12): string {
  const cleanTitle = title.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  const limit = Math.max(1, Math.floor(maxLength));
  if (cleanTitle.length <= limit) return cleanTitle;
  if (limit === 1) return '…';
  return `${cleanTitle.slice(0, limit - 1)}…`;
}
