import type { Book } from '../types/book';

const coverColors = [
  '#849887',
  '#8799A8',
  '#A9857D',
  '#9386A3',
  '#AA966D',
  '#718F8B',
  '#A98291',
  '#8B8F71',
  '#7D8FA8',
  '#9B8A76',
  '#788D7E',
  '#A28D80',
];

const profileColorCount = 8;

export function getBookColor(index: number): string {
  return coverColors[index % coverColors.length];
}

export function getProfileAvatarColors(name: string) {
  const initial = name.trim().charAt(0).toLocaleUpperCase() || 'J';
  const letterIndex = initial.charCodeAt(0) - 'A'.charCodeAt(0);
  const paletteIndex =
    ((letterIndex % profileColorCount) + profileColorCount) % profileColorCount;
  const color = coverColors[paletteIndex];
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);

  return {
    backgroundColor: `rgba(${red}, ${green}, ${blue}, 0.24)`,
    borderColor: `rgba(${red}, ${green}, ${blue}, 0.42)`,
    textColor: color,
  };
}

export function normalizeBookColors(books: Book[]): Book[] {
  return books.map((book, index) => ({
    ...book,
    color: getBookColor(index),
  }));
}
