import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { ImportedBook } from '../types'
import BookCover from '../components/BookCover'
import Icon from '../components/Icon'
import ProgressBar from '../components/ProgressBar'
import SectionHeading from '../components/SectionHeading'
import { truncateText } from '../utils/truncateText'

function getBooksPerPage(): number {
  if (window.innerWidth <= 380) return 2
  if (window.innerWidth <= 720) return 3
  if (window.innerWidth <= 1000) return 5
  return 6
}

type Props = {
  name: string
  books: ImportedBook[]
  currentBookId: string | null
  search: string
  isImporting: boolean
  onSearchChange: (search: string) => void
  onOpenBook: (book: ImportedBook) => void
  onDeleteBook: (book: ImportedBook) => void
  onOpenProfile: () => void
  onImportFile: (file: File) => void
}

export default function LibraryScreen({
  name,
  books,
  currentBookId,
  search,
  isImporting,
  onSearchChange,
  onOpenBook,
  onDeleteBook,
  onOpenProfile,
  onImportFile,
}: Props) {
  const [showBookMenu, setShowBookMenu] = useState<string | null>(null)
  const [shelfPage, setShelfPage] = useState(0)
  const [booksPerPage, setBooksPerPage] = useState(getBooksPerPage)
  const fileInput = useRef<HTMLInputElement>(null)
  const currentBook = books.find((book) => book.id === currentBookId)
  const filteredBooks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return books
    return books.filter(
      (book) =>
        book.title.toLocaleLowerCase().includes(query) ||
        book.author.toLocaleLowerCase().includes(query),
    )
  }, [books, search])
  const pageCount = Math.ceil(filteredBooks.length / booksPerPage)
  const currentShelfPage = Math.min(shelfPage, Math.max(0, pageCount - 1))
  const visibleBooks = filteredBooks.slice(
    currentShelfPage * booksPerPage,
    (currentShelfPage + 1) * booksPerPage,
  )

  useEffect(() => {
    const updateBooksPerPage = () => setBooksPerPage(getBooksPerPage())
    window.addEventListener('resize', updateBooksPerPage)
    return () => window.removeEventListener('resize', updateBooksPerPage)
  }, [])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) onImportFile(file)
  }

  const openFilePicker = () => fileInput.current?.click()
  const handleSearchChange = (value: string) => {
    setShelfPage(0)
    onSearchChange(value)
  }

  return (
    <main className="library-page">
      <header className="topbar">
        <button className="brand-lockup" aria-label="Go to library">
          <span className="brand-icon"><Icon name="book" size={18} /></span>
          <span className="brand-name">lemua</span>
        </button>
        <span className="topbar-caption">A little space for your stories</span>
        <button
          className="avatar-button"
          onClick={onOpenProfile}
          aria-label="Open profile"
        >
          {(name.trim()[0] || 'J').toUpperCase()}
        </button>
      </header>

      <section className="library-content">
        <div className="welcome-row">
          <h1>Hi, {name}</h1>
        </div>

        <label className="search-field">
          <Icon name="search" size={19} />
          <input
            type="search"
            placeholder="Search your library"
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="clear-search"
              aria-label="Clear search"
              onClick={() => handleSearchChange('')}
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </label>

        {!search && currentBook && (
          <>
            <SectionHeading>Currently reading</SectionHeading>
            <article className="current-card">
              <button
                className="featured-cover-button"
                onClick={() => onOpenBook(currentBook)}
                aria-label={`Continue reading ${currentBook.title}`}
              >
                <BookCover book={currentBook} featured />
              </button>
              <div className="current-details">
                <h3 title={currentBook.title}>
                  {truncateText(currentBook.title, 32)}
                </h3>
                <p className="book-byline">{currentBook.author}</p>
                <ProgressBar value={currentBook.progress} />
                <button
                  className="primary-button"
                  onClick={() => onOpenBook(currentBook)}
                >
                  Continue reading <Icon name="chevron-right" size={17} />
                </button>
              </div>
            </article>
          </>
        )}

        <SectionHeading
          aside={<span className="count-pill">{filteredBooks.length} books</span>}
        >
          {search ? 'Search results' : 'Your bookshelf'}
        </SectionHeading>
        {filteredBooks.length > 0 ? (
          <>
            <div className="book-shelf" role="list" aria-label="Bookshelf">
              {visibleBooks.map((book) => (
              <article className="shelf-item" key={book.id} role="listitem">
                <div className="shelf-cover-wrap">
                  <button
                    className="shelf-cover-button"
                    onClick={() => onOpenBook(book)}
                    aria-label={`Open ${book.title}`}
                  >
                    <BookCover book={book} />
                  </button>
                  <button
                    className="book-menu-button"
                    aria-label={`More options for ${book.title}`}
                    onClick={() =>
                      setShowBookMenu(showBookMenu === book.id ? null : book.id)
                    }
                  >
                    <Icon name="more" size={17} />
                  </button>
                  {showBookMenu === book.id && (
                    <div className="book-menu">
                      <button onClick={() => onOpenBook(book)}>Open book</button>
                      <button
                        className="delete-book-action"
                        onClick={() => {
                          setShowBookMenu(null)
                          onDeleteBook(book)
                        }}
                      >
                        Delete book
                      </button>
                    </div>
                  )}
                </div>
                <p className="shelf-title" title={book.title}>
                  {truncateText(book.title, 22)}
                </p>
                <p className="shelf-author">{book.author}</p>
              </article>
              ))}
            </div>
            {pageCount > 1 && (
              <nav className="shelf-pagination" aria-label="Bookshelf pages">
                <button
                  type="button"
                  aria-label="Previous bookshelf page"
                  disabled={currentShelfPage === 0}
                  onClick={() => setShelfPage(currentShelfPage - 1)}
                >
                  <Icon name="chevron-left" size={18} />
                </button>
                <span aria-live="polite">
                  {currentShelfPage * booksPerPage + 1}–
                  {Math.min((currentShelfPage + 1) * booksPerPage, filteredBooks.length)}
                  {' '}of {filteredBooks.length}
                </span>
                <button
                  type="button"
                  aria-label="Next bookshelf page"
                  disabled={currentShelfPage >= pageCount - 1}
                  onClick={() => setShelfPage(currentShelfPage + 1)}
                >
                  <Icon name="chevron-right" size={18} />
                </button>
              </nav>
            )}
          </>
        ) : (
          search ? (
            <div className="empty-search">
              <Icon name="search" size={24} />
              <p>No books match “{search}”</p>
              <button onClick={() => handleSearchChange('')}>Clear search</button>
            </div>
          ) : (
            <div className="empty-library">
              <span className="empty-library-icon"><Icon name="book" size={25} /></span>
              <h2>Your bookshelf is waiting</h2>
              <p>Add an EPUB from Files to start your library.</p>
              <button
                className="primary-button"
                disabled={isImporting}
                onClick={openFilePicker}
              >
                {isImporting ? 'Adding your EPUB…' : 'Add your first EPUB'}
                <Icon name="chevron-right" size={17} />
              </button>
            </div>
          )
        )}

        <div className="library-bottom-grid">
          <input
            ref={fileInput}
            className="epub-file-input"
            type="file"
            accept=".epub,application/epub+zip"
            aria-label="Choose an EPUB file"
            onChange={handleFileChange}
          />
          <button
            className="import-card"
            disabled={isImporting}
            onClick={openFilePicker}
          >
            <span className="import-icon"><Icon name="plus" size={20} /></span>
            <span className="import-copy">
              <strong>{isImporting ? 'Adding your EPUB…' : 'Add an EPUB from Files'}</strong>
              <small>{isImporting ? 'Getting your book ready to read.' : 'Your next favorite is one book away.'}</small>
            </span>
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
      </section>
      <footer className="page-footer">
        <span>Made for slower moments.</span>
        <span>LEMUA · YOUR PERSONAL LIBRARY</span>
      </footer>
    </main>
  )
}
