import type { Book } from '../types/book';

const markSymbols = [
  '✦',
  '❋',
  '◈',
  '❖',
  '✿',
  '❦',
  '⌘',
  '❉',
  '✺',
  '❀',
  '❂',
  '◇',
  '♧',
  '❧',
  '☾',
  '☀',
  '♜',
  '♞',
  '♛',
  '♕',
  '♙',
  '♬',
  '❃',
  '✧',
  '✥',
];

export function getBookMark(index: number): string {
  const symbol = markSymbols[index % markSymbols.length];
  const setNumber = Math.floor(index / markSymbols.length);
  return setNumber === 0 ? symbol : `${symbol}${setNumber + 1}`;
}

export function normalizeBookMarks(books: Book[]): Book[] {
  return books.map((book, index) => ({
    ...book,
    mark: getBookMark(index),
  }));
}
