import type { ImportedBook } from './types'
import { epubParserVersion, parseEpub } from './epub'

export type UserSettings = {
  name: string
  isDark: boolean
}

const databaseName = 'lemua'
const storeName = 'settings'
const booksStoreName = 'books'
const settingsKey = 'user-preferences'
const defaultSettings: UserSettings = { name: 'Jamie', isDark: false }

let databasePromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 3)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(booksStoreName)) {
        database.createObjectStore(booksStoreName, { keyPath: 'id' })
      }
      const booksStore = request.transaction?.objectStore(booksStoreName)
      if (booksStore && !booksStore.indexNames.contains('fileFingerprint')) {
        booksStore.createIndex('fileFingerprint', 'fileFingerprint', { unique: true })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = undefined
      }
      resolve(database)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Could not open the settings database.'))
    }
    request.onblocked = () => {
      reject(new Error('The settings database is blocked by another tab.'))
    }
  }).catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  databasePromise = pending

  return pending
}

export async function loadSettings(): Promise<UserSettings> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readonly')
  const request = transaction.objectStore(storeName).get(settingsKey)
  const record: unknown = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      reject(request.error ?? new Error('Could not read saved settings.'))
    }
  })

  if (typeof record !== 'object' || record === null) return defaultSettings

  return {
    name:
      'name' in record && typeof record.name === 'string'
        ? record.name
        : defaultSettings.name,
    isDark:
      'isDark' in record && typeof record.isDark === 'boolean'
        ? record.isDark
        : defaultSettings.isDark,
  }
}

export async function persistSettings(
  changes: Partial<UserSettings>,
): Promise<void> {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.get(settingsKey)
    request.onsuccess = () => {
      const current: unknown = request.result
      const previous =
        typeof current === 'object' && current !== null ? current : {}
      const settings: UserSettings = {
        name:
          'name' in previous && typeof previous.name === 'string'
            ? previous.name
            : defaultSettings.name,
        isDark:
          'isDark' in previous && typeof previous.isDark === 'boolean'
            ? previous.isDark
            : defaultSettings.isDark,
        ...changes,
      }
      store.put({ id: settingsKey, ...settings })
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not save settings.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Saving settings was aborted.'))
    }
  })
}

export async function loadImportedBooks(): Promise<ImportedBook[]> {
  const database = await openDatabase()
  const transaction = database.transaction(booksStoreName, 'readonly')
  const request = transaction.objectStore(booksStoreName).getAll()

  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const books = request.result as ImportedBook[]
      resolve(
        books.sort(
          (left, right) => (right.lastReadAt ?? 0) - (left.lastReadAt ?? 0),
        ),
      )
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Could not read imported books.'))
    }
  })
}

export async function persistLastRead(bookId: string): Promise<void> {
  await updateImportedBook(bookId, { lastReadAt: Date.now() })
}

export async function upgradeImportedBook(book: ImportedBook): Promise<ImportedBook> {
  if (book.epubParserVersion === epubParserVersion) return book

  const parsed = await parseEpub(new File([book.file], `${book.title}.epub`))
  const previousParagraph = book.chapters[book.lastChapterIndex ?? 0]?.paragraphs[0]
  const matchedIndex = previousParagraph
    ? parsed.chapters.findIndex((chapter) => chapter.paragraphs.includes(previousParagraph))
    : -1
  const lastChapterIndex = Math.max(0, matchedIndex)
  // Old page numbers refer to file-sized chapters, not the recovered chapter boundaries.
  const updatedBook: ImportedBook = {
    ...book,
    chapters: parsed.chapters,
    epubParserVersion,
    lastChapterIndex,
    lastReaderPage: 0,
    progress: Math.round((lastChapterIndex / parsed.chapters.length) * 100),
  }
  await updateImportedBook(book.id, updatedBook)
  return updatedBook
}

export async function persistReadingPosition(
  bookId: string,
  position: Pick<
    ImportedBook,
    'lastChapterIndex' | 'lastReaderPage' | 'progress'
  >,
): Promise<void> {
  await updateImportedBook(bookId, position)
}

export async function persistImportedBook(book: ImportedBook): Promise<void> {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(booksStoreName, 'readwrite')
    transaction.objectStore(booksStoreName).add(book)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not save this EPUB.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Saving this EPUB was aborted.'))
    }
  })
}

export async function deleteImportedBook(bookId: string): Promise<void> {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(booksStoreName, 'readwrite')
    transaction.objectStore(booksStoreName).delete(bookId)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not delete this book.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Deleting this book was aborted.'))
    }
  })
}

async function updateImportedBook(
  bookId: string,
  changes: Partial<ImportedBook>,
): Promise<void> {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(booksStoreName, 'readwrite')
    const store = transaction.objectStore(booksStoreName)
    const request = store.get(bookId)
    request.onsuccess = () => {
      const book = request.result as ImportedBook | undefined
      if (!book) {
        reject(new Error('Could not find this saved book.'))
        transaction.abort()
        return
      }
      store.put({ ...book, ...changes })
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Could not update this saved book.'))
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not update this saved book.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Updating this saved book was aborted.'))
    }
  })
}
