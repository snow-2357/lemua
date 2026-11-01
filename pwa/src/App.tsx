import { useEffect, useState } from 'react'
import './App.css'
import AudioPreviewScreen from './screens/AudioPreviewScreen'
import LibraryScreen from './screens/LibraryScreen'
import ProfileScreen from './screens/ProfileScreen'
import ReaderScreen from './screens/ReaderScreen'
import { parseEpub } from './epub'
import {
  loadImportedBooks,
  loadSettings,
  persistImportedBook,
  persistLastRead,
  persistSettings,
} from './settings'
import type { ImportedBook } from './types'

type Page = 'library' | 'profile' | 'reader' | 'audio'

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
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [notice, setNotice] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const activeBook = importedBooks.find((book) => book.id === activeBookId)
  const chapterTitles = activeBook?.chapters.map((chapter) => chapter.title) ?? []
  const activeChapter = activeBook?.chapters[chapterIndex]
  const pageCount = activeChapter
    ? Math.max(1, Math.ceil(activeChapter.paragraphs.length / 3))
    : 1
  const audioExcerpt =
    activeChapter?.paragraphs
      .slice(readerPage * 3, readerPage * 3 + 3)
      .join(' ') ??
    ''

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
    setActiveBookId(book.id)
    setChapterIndex(0)
    setReaderPage(0)
    setPage('reader')
    const updatedBook = { ...book, lastReadAt: Date.now() }
    setImportedBooks((currentBooks) =>
      [updatedBook, ...currentBooks.filter((current) => current.id !== book.id)],
    )
    void persistLastRead(book).catch((error: unknown) => {
      console.error('Could not save recent reading activity.', error)
      notify('Could not save this book as your current read.')
    })
  }

  const importBook = async (file: File) => {
    setIsImporting(true)
    try {
      const importedBook = await parseEpub(file)
      await persistImportedBook(importedBook)
      setImportedBooks((currentBooks) => [importedBook, ...currentBooks])
      notify(`“${importedBook.title}” was added to your bookshelf.`)
    } catch (error) {
      console.error('Could not import EPUB.', error)
      notify(
        error instanceof Error
          ? error.message
          : 'Could not import this EPUB. Please try another file.',
      )
    } finally {
      setIsImporting(false)
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
  const progress = activeBook
    ? Math.min(activeBook.progress + readerPage * 3, 100)
    : 0

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
          readerPage={readerPage}
          pageCount={pageCount}
          progress={progress}
          onBack={goBackToLibrary}
          onOpenAudio={() => {
            setIsPlaying(false)
            setPage('audio')
          }}
          onChangeChapter={setChapterIndex}
          onChangePage={setReaderPage}
        />
      )}
      {page === 'audio' && activeBook && activeChapter && (
        <AudioPreviewScreen
          book={activeBook}
          chapterTitle={activeChapter.title}
          excerpt={audioExcerpt}
          isPlaying={isPlaying}
          speed={speed}
          onBack={() => {
            setPage('reader')
            setIsPlaying(false)
          }}
          onTogglePlaying={() => setIsPlaying(!isPlaying)}
          onChangeSpeed={setSpeed}
        />
      )}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

export default App
