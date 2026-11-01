import { useEffect, useState } from 'react'
import './App.css'
import AudioPreviewScreen from './screens/AudioPreviewScreen'
import LibraryScreen from './screens/LibraryScreen'
import ProfileScreen from './screens/ProfileScreen'
import ReaderScreen from './screens/ReaderScreen'
import { books } from './data'
import { loadSettings, persistSettings } from './settings'
import type { Book } from './types'

type Page = 'library' | 'profile' | 'reader' | 'audio'

function App() {
  const [page, setPage] = useState<Page>('library')
  const [activeBookId, setActiveBookId] = useState(books[0].id)
  const [search, setSearch] = useState('')
  const [name, setName] = useState('Jamie')
  const [isDark, setIsDark] = useState(false)
  const [chapterIndex, setChapterIndex] = useState(0)
  const [readerPage, setReaderPage] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [notice, setNotice] = useState('')
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const activeBook = books.find((book) => book.id === activeBookId) ?? books[0]

  useEffect(() => {
    let active = true

    loadSettings()
      .then((settings) => {
        if (!active) return
        setName(settings.name)
        setIsDark(settings.isDark)
      })
      .catch((error: unknown) => {
        console.error('Could not load saved profile settings.', error)
        if (active) {
          setNotice('Could not load saved settings. Using defaults.')
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

  const openBook = (book: Book) => {
    setActiveBookId(book.id)
    setChapterIndex(0)
    setReaderPage(0)
    setPage('reader')
  }

  const notify = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
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
  const progress = Math.min(activeBook.progress + readerPage * 3, 100)

  if (!settingsLoaded) {
    return <main className="settings-loading" role="status">Loading your library…</main>
  }

  return (
    <div className={`app-shell${isDark ? ' theme-dark' : ''}`}>
      {page === 'library' && (
        <LibraryScreen
          name={name}
          search={search}
          onSearchChange={setSearch}
          onOpenBook={openBook}
          onOpenProfile={() => setPage('profile')}
          onNotify={notify}
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
      {page === 'reader' && (
        <ReaderScreen
          book={activeBook}
          chapterIndex={chapterIndex}
          readerPage={readerPage}
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
      {page === 'audio' && (
        <AudioPreviewScreen
          book={activeBook}
          chapterIndex={chapterIndex}
          readerPage={readerPage}
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
