import { useMemo, useState } from 'react'
import { books } from '../data'
import type { Book } from '../types'
import BookCover from '../components/BookCover'
import Icon from '../components/Icon'
import ProgressBar from '../components/ProgressBar'
import SectionHeading from '../components/SectionHeading'

type Props = {
  name: string
  search: string
  onSearchChange: (search: string) => void
  onOpenBook: (book: Book) => void
  onOpenProfile: () => void
  onNotify: (message: string) => void
}

export default function LibraryScreen({
  name,
  search,
  onSearchChange,
  onOpenBook,
  onOpenProfile,
  onNotify,
}: Props) {
  const [showBookMenu, setShowBookMenu] = useState<string | null>(null)
  const filteredBooks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return books
    return books.filter(
      (book) =>
        book.title.toLocaleLowerCase().includes(query) ||
        book.author.toLocaleLowerCase().includes(query),
    )
  }, [search])
  const featuredBook = books[0]

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
          <div>
            <p className="eyebrow">YOUR PERSONAL LIBRARY</p>
            <h1>A good story<br className="mobile-break" /> lives here.</h1>
            <p className="welcome-copy">
              Welcome back, {name}. Pick up where your imagination left off.
            </p>
          </div>
          <div className="welcome-art" aria-hidden="true">
            <span className="art-sun" />
            <span className="art-book art-book-one" />
            <span className="art-book art-book-two" />
            <span className="art-stem">✳</span>
          </div>
        </div>

        <label className="search-field">
          <Icon name="search" size={19} />
          <input
            type="search"
            placeholder="Search your library"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="clear-search"
              aria-label="Clear search"
              onClick={() => onSearchChange('')}
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </label>

        {!search && (
          <>
            <SectionHeading>Currently reading</SectionHeading>
            <article className="current-card">
              <button
                className="featured-cover-button"
                onClick={() => onOpenBook(featuredBook)}
                aria-label={`Open ${featuredBook.title}`}
              >
                <BookCover book={featuredBook} featured />
              </button>
              <div className="current-details">
                <p className="eyebrow">BACK TO YOUR STORY</p>
                <h3>{featuredBook.title}</h3>
                <p className="book-byline">{featuredBook.author}</p>
                <p className="current-note">
                  A quiet corner, a curious girl, and a garden waiting to wake.
                </p>
                <ProgressBar value={featuredBook.progress} />
                <button
                  className="primary-button"
                  onClick={() => onOpenBook(featuredBook)}
                >
                  Continue reading <Icon name="chevron-right" size={17} />
                </button>
              </div>
              <span className="card-sparkle" aria-hidden="true">
                <Icon name="sparkle" size={25} />
              </span>
            </article>
          </>
        )}

        <SectionHeading
          aside={<span className="count-pill">{filteredBooks.length} books</span>}
        >
          {search ? 'Search results' : 'Your bookshelf'}
        </SectionHeading>
        {filteredBooks.length > 0 ? (
          <div className="book-shelf">
            {filteredBooks.map((book) => (
              <article className="shelf-item" key={book.id}>
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
                      <span>{book.title}</span>
                      <small>{book.author}</small>
                      <button onClick={() => onOpenBook(book)}>Open book</button>
                    </div>
                  )}
                </div>
                <p className="shelf-title">{book.title}</p>
                <p className="shelf-author">{book.author}</p>
                <div className="mini-progress">
                  <span style={{ width: `${book.progress}%` }} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-search">
            <Icon name="search" size={24} />
            <p>No books match “{search}”</p>
            <button onClick={() => onSearchChange('')}>Clear search</button>
          </div>
        )}

        <div className="library-bottom-grid">
          <button
            className="import-card"
            onClick={() => onNotify('EPUB importing will be added next.')}
          >
            <span className="import-icon"><Icon name="plus" size={20} /></span>
            <span className="import-copy">
              <strong>Add an EPUB from Files</strong>
              <small>Your next favorite is one book away.</small>
            </span>
            <Icon name="chevron-right" size={18} />
          </button>
          <article className="milestone-card">
            <span className="milestone-icon"><Icon name="sparkle" size={19} /></span>
            <div>
              <p className="eyebrow">READING MILESTONES</p>
              <h3>Your reading journey</h3>
              <p>Make a little time for a story today.</p>
            </div>
            <span className="milestone-count">01 <small>in progress</small></span>
          </article>
        </div>
      </section>
      <footer className="page-footer">
        <span>Made for slower moments.</span>
        <span>LEMUA · YOUR PERSONAL LIBRARY</span>
      </footer>
    </main>
  )
}
