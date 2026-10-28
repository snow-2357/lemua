import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { getEpubFingerprint, importEpub, readEpub } from '../services/epubReader';
import { deleteStoredBook, loadBooks, saveBooks } from '../services/libraryStorage';
import { getBookMark } from '../services/bookMarks';
import { getBookColor } from '../services/bookColors';
import type { Book, ReaderState } from '../types/book';

function normalizeBookMetadata(value: string): string {
  return value
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function useLibraryController() {
  const [books, setBooks] = useState<Book[]>([]);
  const [reader, setReader] = useState<ReaderState | null>(null);
  const [isAddingBook, setIsAddingBook] = useState(false);
  const [isOpeningBook, setIsOpeningBook] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const booksRef = useRef<Book[]>([]);
  const libraryStatusRef = useRef<'loading' | 'ready' | 'error'>('loading');
  const booksUpdateQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let isMounted = true;

    void loadBooks()
      .then((savedBooks) => {
        if (!isMounted) return;
        booksRef.current = savedBooks;
        setBooks(savedBooks);
        libraryStatusRef.current = 'ready';
        setLibraryStatus('ready');
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        libraryStatusRef.current = 'error';
        setLibraryStatus('error');
        Alert.alert(
          'Could not load library',
          error instanceof Error ? error.message : 'Saved books could not be restored.',
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateBooks = useCallback((update: (current: Book[]) => Book[]) => {
    const operation = booksUpdateQueue.current.then(async () => {
      if (libraryStatusRef.current !== 'ready') {
        throw new Error('The saved library is not available.');
      }

      const currentBooks = booksRef.current;
      const nextBooks = update(currentBooks);
      if (nextBooks === currentBooks) return;

      await saveBooks(nextBooks);
      booksRef.current = nextBooks;
      setBooks(nextBooks);
    });
    booksUpdateQueue.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const openBook = useCallback(async (book: Book) => {
    if (isOpeningBook) return;
    setIsOpeningBook(true);
    try {
      if (!book.uri) {
        const previewChapter = {
          title: 'A reading preview',
          text: 'This quiet little corner is waiting for a story. Import an EPUB from your Files app to open its chapters here and settle in with a book.',
        };
        setReader({
          book,
          epub: {
            chapterCount: 1,
            tableOfContents: [{ title: previewChapter.title, chapterIndex: 0 }],
            loadChapter: async () => previewChapter,
          },
          tableOfContents: [{ title: 'A reading preview', chapterIndex: 0 }],
          chapterIndex: 0,
          isPreview: true,
        });
        return;
      }

      const epub = await readEpub(book.uri);
      let openedBook: Book = {
        ...book,
        title: epub.title || book.title,
        author: epub.author || book.author,
      };
      setReader({
        book: openedBook,
        epub,
        tableOfContents: epub.tableOfContents,
        chapterIndex: openedBook.readingChapterIndex ?? 0,
        isPreview: false,
      });
      void updateBooks((currentBooks) => {
        const mostRecentOpen = currentBooks.reduce(
          (latest, item) => Math.max(latest, item.lastOpenedAt ?? 0),
          0,
        );
        openedBook = {
          ...openedBook,
          lastOpenedAt: Math.max(Date.now(), mostRecentOpen + 1),
        };

        return [
          openedBook,
          ...currentBooks.filter((item) => item.id !== book.id),
        ];
      }).catch((error: unknown) => {
        Alert.alert(
          'Could not update library',
          error instanceof Error
            ? error.message
            : 'The book opened, but its recent activity could not be saved.',
        );
      });
    } catch (error) {
      Alert.alert(
        'Could not open book',
        error instanceof Error ? error.message : 'The EPUB could not be read.',
      );
    } finally {
      setIsOpeningBook(false);
    }
  }, [isOpeningBook, updateBooks]);

  const addBook = useCallback(async () => {
    if (libraryStatusRef.current !== 'ready') return;
    setIsAddingBook(true);
    let importedUri: string | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: Platform.OS !== 'android',
      });

      if (result.canceled) return;

      const file = result.assets[0];
      if (!file.name.toLowerCase().endsWith('.epub')) {
        Alert.alert('Choose an EPUB file', 'Only .epub books can be added right now.');
        return;
      }

      const fallbackTitle = file.name.replace(/\.epub$/i, '').trim() || 'Untitled book';
      const epub = await importEpub(file.uri);
      importedUri = epub.uri;
      const contentHash = await getEpubFingerprint(epub.uri);
      const importedBook = {
        id: epub.uri,
        title: epub.title || fallbackTitle,
        author: epub.author || 'N/A',
        uri: epub.uri,
        contentHash,
      };

      let isDuplicate = false;
      await updateBooks((currentBooks) => {
        isDuplicate = currentBooks.some(
          (book) =>
            book.contentHash === contentHash ||
            (normalizeBookMetadata(book.title) ===
              normalizeBookMetadata(importedBook.title) &&
              normalizeBookMetadata(book.author) ===
                normalizeBookMetadata(importedBook.author)),
        );
        return isDuplicate
          ? currentBooks
          : [
              ...currentBooks,
              {
                ...importedBook,
                color: getBookColor(currentBooks.length),
                mark: getBookMark(currentBooks.length),
              },
            ];
      });

      if (isDuplicate) {
        await deleteStoredBook(epub.uri);
        importedUri = undefined;
        Alert.alert(
          'Book already in your library',
          `${importedBook.title} by ${importedBook.author} is already there.`,
        );
        return;
      }

      importedUri = undefined;
    } catch (error) {
      if (importedUri) {
        try {
          await deleteStoredBook(importedUri);
        } catch (cleanupError) {
          const cleanupMessage =
            cleanupError instanceof Error
              ? cleanupError.message
              : 'The copied EPUB could not be removed.';
          Alert.alert(
            'Could not save book',
            `The library was not updated, and the copied EPUB could not be removed: ${cleanupMessage}`,
          );
          return;
        }
      }
      Alert.alert(
        'Could not add EPUB',
        error instanceof Error ? error.message : 'Please try selecting the file again.',
      );
    } finally {
      setIsAddingBook(false);
    }
  }, [updateBooks]);

  const removeBook = useCallback(async (book: Book) => {
    try {
      await updateBooks((currentBooks) =>
        currentBooks.some((item) => item.id === book.id)
          ? currentBooks.filter((item) => item.id !== book.id)
          : currentBooks,
      );
    } catch (error) {
      Alert.alert(
        'Could not remove book',
        error instanceof Error ? error.message : 'The library could not be updated.',
      );
      return;
    }

    if (!book.uri) return;

    try {
      await deleteStoredBook(book.uri);
    } catch (error) {
      Alert.alert(
        'Book removed from library',
        error instanceof Error
          ? `Its saved EPUB file could not be deleted: ${error.message}`
          : 'Its saved EPUB file could not be deleted.',
      );
    }
  }, [updateBooks]);

  const confirmRemoveBook = useCallback((book: Book) => {
    Alert.alert(
      'Remove book?',
      `“${book.title}” will be removed from your library and deleted from this device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeBook(book),
        },
      ],
    );
  }, [removeBook]);

  const closeBook = useCallback(() => setReader(null), []);
  const setReaderProgress = useCallback((
    chapterIndex: number,
    textOffset: number,
    readingProgress: number,
  ) => {
    const bookId = reader?.book.id;
    if (!bookId) return;

    setReader((current) =>
      current
        ? {
            ...current,
            chapterIndex,
            book: {
              ...current.book,
              readingChapterIndex: chapterIndex,
              readingTextOffset: textOffset,
              readingProgress,
            },
          }
        : current,
    );
    void updateBooks((currentBooks) => {
      const currentBook = currentBooks.find((book) => book.id === bookId);
      if (
        !currentBook ||
        (currentBook.readingChapterIndex === chapterIndex &&
          currentBook.readingTextOffset === textOffset &&
          currentBook.readingProgress === readingProgress)
      ) {
        return currentBooks;
      }

      return currentBooks.map((book) =>
        book.id === bookId
          ? {
              ...book,
              readingChapterIndex: chapterIndex,
              readingTextOffset: textOffset,
              readingProgress,
            }
          : book,
      );
    }).catch((error: unknown) => {
      Alert.alert(
        'Could not save reading progress',
        error instanceof Error ? error.message : 'The latest reading position was not saved.',
      );
    });
  }, [reader?.book.id, updateBooks]);

  return {
    books,
    libraryStatus,
    reader,
    isAddingBook,
    isOpeningBook,
    addBook,
    openBook,
    confirmRemoveBook,
    closeBook,
    setReaderProgress,
  };
}
