import { useEffect, useRef, useState } from 'react'
import './App.css'
import LibraryScreen from './screens/LibraryScreen'
import ProfileScreen from './screens/ProfileScreen'
import ReaderScreen from './screens/ReaderScreen'
import { isContentsChapterTitle, parseEpub } from './epub'
import {
  loadImportedBooks,
  loadSettings,
  deleteImportedBook,
  persistImportedBook,
  persistLastRead,
  persistReadingPosition,
  persistSettings,
} from './settings'
import type { EpubChapter, ImportedBook } from './types'
import { getFileFingerprint } from './utils/fileFingerprint'

type Page = 'library' | 'profile' | 'reader'

function readableChapters(book: ImportedBook): EpubChapter[] {
  return book.chapters.filter((chapter) => !isContentsChapterTitle(chapter.title))
}

async function findLegacyDuplicate(
  books: ImportedBook[],
  file: File,
  fileFingerprint: string,
): Promise<ImportedBook | undefined> {
  for (const book of books) {
    if (book.file.size !== file.size || book.fileFingerprint) continue
    if ((await getFileFingerprint(book.file)) === fileFingerprint) return book
  }
}

function getReadingProgress(
  chapters: EpubChapter[],
  chapterIndex: number,
  readerPage: number,
  measuredPageCounts: Record<number, number>,
): number {
  const pagesPerChapter = chapters.map(
    (chapter, index) =>
      measuredPageCounts[index] ??
      Math.max(1, Math.ceil(chapter.paragraphs.length / 3)),
  )
  const totalPages = pagesPerChapter.reduce((total, pages) => total + pages, 0)
  if (totalPages === 0) return 0

  const pagesBeforeChapter = pagesPerChapter
    .slice(0, chapterIndex)
    .reduce((total, pages) => total + pages, 0)
  const currentChapterPages = pagesPerChapter[chapterIndex] ?? 1
  const pagesRead = pagesBeforeChapter + Math.min(readerPage + 1, currentChapterPages)
  return Math.round((pagesRead / totalPages) * 100)
}

function App() {
  const [page, setPage] = useState<Page>('library')
  const [activeBookId, setActiveBookId] = useState<string | null>(null)
  const [importedBooks, setImportedBooks] = useState<ImportedBook[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('Jamie')
  const [isDark, setIsDark] = useState(false)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [readerPage, setReaderPage] = useState(0)
  const [chapterPageCounts, setChapterPageCounts] = useState<Record<number, number>>({})
  const [notice, setNotice] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const importInProgress = useRef(false)

  const activeBook = importedBooks.find((book) => book.id === activeBookId)
  const chapters = activeBook ? readableChapters(activeBook) : []
  const chapterTitles = chapters.map((chapter) => chapter.title)
  const activeChapter = chapters[chapterIndex]
  const notify = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  useEffect(() => {
    let active = true

    Promise.allSettled([loadSettings(), loadImportedBooks()])
      .then(([settingsResult, importedBooksResult]) => {
        if (!active) return

        if (settingsResult.status === 'fulfilled') {
          setName(settingsResult.value.name)
          setIsDark(settingsResult.value.isDark)
        } else {
          console.error('Could not load saved profile settings.', settingsResult.reason)
        }

        if (importedBooksResult.status === 'fulfilled') {
          const savedBooks = importedBooksResult.value
          setImportedBooks(savedBooks)
          setActiveBookId(savedBooks[0]?.id ?? null)
        } else {
          console.error('Could not load imported books.', importedBooksResult.reason)
        }

        if (
          settingsResult.status === 'rejected' ||
          importedBooksResult.status === 'rejected'
        ) {
          setNotice('Some saved data could not be loaded.')
          window.setTimeout(() => setNotice(''), 2600)
        }
      })
      .finally(() => {
        if (active) setSettingsLoaded(true)
      })

    return () => {
      active = false
    }
  }, [])

  const openBook = (book: ImportedBook) => {
    window.scrollTo(0, 0)
    const bookChapters = readableChapters(book)
    const nextChapterIndex = Math.min(
      book.lastChapterIndex ?? 0,
      Math.max(0, bookChapters.length - 1),
    )
    const nextReaderPage = book.lastReaderPage ?? 0
    setActiveBookId(book.id)
    setChapterIndex(nextChapterIndex)
    setReaderPage(nextReaderPage)
    setChapterPageCounts({})
    setPage('reader')
    const updatedBook = { ...book, lastReadAt: Date.now() }
    setImportedBooks((currentBooks) =>
      [updatedBook, ...currentBooks.filter((current) => current.id !== book.id)],
    )
    void persistLastRead(book.id).catch((error: unknown) => {
      console.error('Could not save recent reading activity.', error)
      notify('Could not save this book as your current read.')
    })
  }

  const saveReadingPosition = (nextChapterIndex: number, nextReaderPage: number) => {
    setChapterIndex(nextChapterIndex)
    setReaderPage(nextReaderPage)
    if (!activeBook) return

    const progress = getReadingProgress(
      chapters,
      nextChapterIndex,
      nextReaderPage,
      chapterPageCounts,
    )
    setImportedBooks((currentBooks) =>
      currentBooks.map((book) =>
        book.id === activeBook.id
          ? {
              ...book,
              lastChapterIndex: nextChapterIndex,
              lastReaderPage: nextReaderPage,
              progress,
            }
          : book,
      ),
    )
    void persistReadingPosition(activeBook.id, {
      lastChapterIndex: nextChapterIndex,
      lastReaderPage: nextReaderPage,
      progress,
    }).catch((error: unknown) => {
      console.error('Could not save the reading position.', error)
      notify('Could not save your reading position.')
    })
  }

  const changeChapter = (nextChapterIndex: number, nextReaderPage = 0) => {
    saveReadingPosition(nextChapterIndex, nextReaderPage)
  }

  const changeReaderPage = (nextReaderPage: number) => {
    saveReadingPosition(chapterIndex, nextReaderPage)
  }

  const importBook = async (file: File) => {
    if (importInProgress.current) return
    importInProgress.current = true
    setIsImporting(true)
    try {
      const importedBook = await parseEpub(file)
      const fileFingerprint = await getFileFingerprint(file)
      const duplicate = importedBooks.find(
        (book) =>
          book.file.size === file.size &&
          book.fileFingerprint === fileFingerprint,
      ) ?? await findLegacyDuplicate(importedBooks, file, fileFingerprint)
      if (duplicate) {
        notify(`“${duplicate.title}” is already in your bookshelf.`)
        return
      }

      const bookToSave = { ...importedBook, fileFingerprint }
      await persistImportedBook(bookToSave)
      setImportedBooks((currentBooks) => [bookToSave, ...currentBooks])
      notify(`“${importedBook.title}” was added to your bookshelf.`)
    } catch (error) {
      console.error('Could not import EPUB.', error)
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        notify('This EPUB is already in your bookshelf.')
      } else {
        notify(
          error instanceof Error
            ? error.message
            : 'Could not import this EPUB. Please try another file.',
        )
      }
    } finally {
      importInProgress.current = false
      setIsImporting(false)
    }
  }

  const removeBook = async (book: ImportedBook) => {
    const confirmed = window.confirm(
      `Delete “${book.title}” from your bookshelf? This cannot be undone.`,
    )
    if (!confirmed) return

    try {
      await deleteImportedBook(book.id)
      const remainingBooks = importedBooks.filter(
        (currentBook) => currentBook.id !== book.id,
      )
      setImportedBooks(remainingBooks)
      if (activeBookId === book.id) {
        setActiveBookId(remainingBooks[0]?.id ?? null)
      }
      notify(`“${book.title}” was deleted.`)
    } catch (error) {
      console.error('Could not delete imported book.', error)
      notify('Could not delete this book. Please try again.')
    }
  }

  const saveName = async (draftName: string) => {
    const nextName = draftName.trim()
    if (nextName) {
      try {
        await persistSettings({ name: nextName })
        setName(nextName)
        notify('Your profile name has been updated.')
      } catch (error) {
        console.error('Could not save the profile name.', error)
        notify('Could not save your profile name. Please try again.')
      }
    }
  }

  const toggleTheme = async () => {
    const nextIsDark = !isDark
    try {
      await persistSettings({ isDark: nextIsDark })
      setIsDark(nextIsDark)
    } catch (error) {
      console.error('Could not save the appearance setting.', error)
      notify('Could not save your appearance setting. Please try again.')
    }
  }

  const goBackToLibrary = () => setPage('library')
  const progress = getReadingProgress(
    chapters,
    chapterIndex,
    readerPage,
    chapterPageCounts,
  )

  if (!settingsLoaded) {
    return <main className="settings-loading" role="status">Loading your library…</main>
  }

  return (
    <div className={`app-shell${isDark ? ' theme-dark' : ''}`}>
      {page === 'library' && (
        <LibraryScreen
          name={name}
          books={importedBooks}
          currentBookId={activeBookId}
          search={search}
          isImporting={isImporting}
          onSearchChange={setSearch}
          onOpenBook={openBook}
          onDeleteBook={(book) => void removeBook(book)}
          onOpenProfile={() => setPage('profile')}
          onImportFile={importBook}
        />
      )}
      {page === 'profile' && (
        <ProfileScreen
          name={name}
          isDark={isDark}
          onBack={goBackToLibrary}
          onToggleTheme={toggleTheme}
          onSaveName={saveName}
        />
      )}
      {page === 'reader' && activeBook && activeChapter && (
        <ReaderScreen
          book={activeBook}
          chapterTitles={chapterTitles}
          chapterParagraphs={activeChapter.paragraphs}
          chapterIndex={chapterIndex}
          chapterPageCounts={chapterPageCounts}
          readerPage={readerPage}
          onPageCountChange={(count) =>
            setChapterPageCounts((currentCounts) =>
              currentCounts[chapterIndex] === count
                ? currentCounts
                : { ...currentCounts, [chapterIndex]: count },
            )
          }
          progress={progress}
          onBack={goBackToLibrary}
          onChangeChapter={changeChapter}
          onChangePage={changeReaderPage}
        />
      )}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

export default App
