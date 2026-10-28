import * as FileSystem from 'expo-file-system/legacy';
import type { Book } from '../types/book';
import { normalizeBookMarks } from './bookMarks';
import { normalizeBookColors } from './bookColors';

const manifestName = 'library.json';

function getDocumentUri(name: string): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('The app document directory is not available on this device.');
  }

  return `${FileSystem.documentDirectory}${name}`;
}

function isBook(value: unknown): value is Book {
  if (typeof value !== 'object' || value === null) return false;

  const book = value as Record<string, unknown>;
  return (
    typeof book.id === 'string' &&
    typeof book.title === 'string' &&
    typeof book.author === 'string' &&
    typeof book.color === 'string' &&
    typeof book.mark === 'string' &&
    typeof book.uri === 'string' &&
    book.uri.length > 0 &&
    (book.lastOpenedAt === undefined ||
      (typeof book.lastOpenedAt === 'number' && Number.isFinite(book.lastOpenedAt))) &&
    (book.contentHash === undefined || typeof book.contentHash === 'string') &&
    (book.readingChapterIndex === undefined ||
      (typeof book.readingChapterIndex === 'number' &&
        Number.isInteger(book.readingChapterIndex) &&
        book.readingChapterIndex >= 0)) &&
    (book.readingTextOffset === undefined ||
      (typeof book.readingTextOffset === 'number' &&
        Number.isInteger(book.readingTextOffset) &&
        book.readingTextOffset >= 0)) &&
    (book.readingProgress === undefined ||
      (typeof book.readingProgress === 'number' &&
        Number.isInteger(book.readingProgress) &&
        book.readingProgress >= 0 &&
        book.readingProgress <= 100))
  );
}

function sortByLastOpened(books: Book[]): Book[] {
  return [...books].sort(
    (first, second) =>
      (second.lastOpenedAt ?? Number.NEGATIVE_INFINITY) -
      (first.lastOpenedAt ?? Number.NEGATIVE_INFINITY),
  );
}

function isSavedLibrary(
  value: unknown,
): value is { version: 1; books: Book[] } {
  if (typeof value !== 'object' || value === null) return false;

  const library = value as Record<string, unknown>;
  return (
    library.version === 1 &&
    Array.isArray(library.books) &&
    library.books.every(isBook)
  );
}

export async function loadBooks(): Promise<Book[]> {
  const manifestUri = getDocumentUri(manifestName);
  const fileInfo = await FileSystem.getInfoAsync(manifestUri);
  if (!fileInfo.exists) return [];

  let savedLibrary: unknown;
  try {
    savedLibrary = JSON.parse(await FileSystem.readAsStringAsync(manifestUri));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new Error(`The saved library could not be read: ${detail}`);
  }

  if (!isSavedLibrary(savedLibrary)) {
    throw new Error('The saved library has an unsupported or invalid format.');
  }

  const books = sortByLastOpened(
    normalizeBookColors(normalizeBookMarks(savedLibrary.books)),
  );
  if (
    books.some(
      (book, index) =>
        book.mark !== savedLibrary.books[index].mark ||
        book.color !== savedLibrary.books[index].color ||
        book.id !== savedLibrary.books[index].id,
    )
  ) {
    await saveBooks(books);
  }
  return books;
}

export async function saveBooks(books: Book[]): Promise<void> {
  await FileSystem.writeAsStringAsync(
    getDocumentUri(manifestName),
    JSON.stringify({ version: 1, books }),
  );
}

export async function deleteStoredBook(uri: string): Promise<void> {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  if (fileInfo.exists) await FileSystem.deleteAsync(uri);
}
