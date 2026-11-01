import type { CSSProperties } from 'react'
import type { Book } from '../types'

export default function BookCover({
  book,
  featured = false,
}: {
  book: Book
  featured?: boolean
}) {
  return (
    <div
      className={`book-cover${featured ? ' book-cover-featured' : ''}`}
      style={{ '--cover-color': book.color } as CSSProperties}
      aria-label={`${book.title} by ${book.author}`}
    >
      <div className="cover-spine" />
      <div className="cover-ornament">{book.mark}</div>
      <div className="cover-wordmark">
        <span className="cover-kicker">A LEMUA EDITION</span>
        <span className="cover-title">{book.title}</span>
        <span className="cover-author">{book.author}</span>
      </div>
      <div className="cover-gloss" />
    </div>
  )
}
