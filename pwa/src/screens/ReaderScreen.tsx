import { useState } from 'react'
import type { Book } from '../types'
import Icon from '../components/Icon'
import Waveform from '../components/Waveform'
import { truncateText } from '../utils/truncateText'

type Props = {
  book: Book
  chapterTitles: string[]
  chapterParagraphs: string[]
  chapterIndex: number
  readerPage: number
  pageCount: number
  progress: number
  onBack: () => void
  onOpenAudio: () => void
  onChangeChapter: (index: number) => void
  onChangePage: (page: number) => void
}

export default function ReaderScreen({
  book,
  chapterTitles,
  chapterParagraphs,
  chapterIndex,
  readerPage,
  pageCount,
  progress,
  onBack,
  onOpenAudio,
  onChangeChapter,
  onChangePage,
}: Props) {
  const [showContents, setShowContents] = useState(false)

  const previousPage = () => {
    if (readerPage > 0) onChangePage(readerPage - 1)
    else if (chapterIndex > 0) {
      onChangeChapter(chapterIndex - 1)
      onChangePage(0)
    }
  }

  const nextPage = () => {
    if (readerPage < pageCount - 1) onChangePage(readerPage + 1)
    else {
      onChangeChapter((chapterIndex + 1) % chapterTitles.length)
      onChangePage(0)
    }
  }

  const displayedParagraphs = chapterParagraphs
    .slice(readerPage * 3, readerPage * 3 + 3)

  return (
    <main className="reader-page">
      <header className="reader-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to library">
          <Icon name="chevron-left" />
        </button>
        <div className="reader-book-info">
          <strong title={book.title}>{truncateText(book.title, 36)}</strong>
          <span>{book.author}</span>
        </div>
        <button className="contents-button" onClick={() => setShowContents(true)}>
          <Icon name="book" size={16} /><span>Contents</span>
        </button>
      </header>
      <section className="reading-area">
        <article className="reading-page">
          <div className="chapter-label">
            CHAPTER {String(chapterIndex + 1).padStart(2, '0')}
          </div>
          <h1>{chapterTitles[chapterIndex]}</h1>
          <div className="chapter-rule"><span>✦</span></div>
          {displayedParagraphs.map((paragraph, index) => (
            <p className="reading-text" key={`${readerPage}-${index}`}>
              {paragraph}
            </p>
          ))}
          <span className="page-number">{String(readerPage + 1).padStart(2, '0')}</span>
        </article>
      </section>
      <div className="reader-bottom">
        <button className="audio-compact" onClick={onOpenAudio}>
          <span className="audio-compact-top">
            <span>
              <small>KOKORO · WARM TONE</small>
              <strong>Listen to this page</strong>
            </span>
            <span className="audio-play"><Icon name="play" size={16} /></span>
          </span>
          <Waveform />
          <span className="audio-compact-meta">
            <span>00:00</span><span>Open audio preview</span><span>--:--</span>
          </span>
        </button>
        <div className="reader-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="reader-controls">
          <button className="page-arrow" aria-label="Previous page" onClick={previousPage}>
            <Icon name="chevron-left" size={22} />
          </button>
          <span>
            {chapterTitles[chapterIndex]} <i>·</i> Page {readerPage + 1} of {pageCount}
          </span>
          <button className="page-arrow" aria-label="Next page" onClick={nextPage}>
            <Icon name="chevron-right" size={22} />
          </button>
        </div>
      </div>
      {showContents && (
        <div className="modal-backdrop" onClick={() => setShowContents(false)}>
          <section
            className="contents-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contents-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="contents-sheet-header">
              <div>
                <p className="eyebrow">A LITTLE MAP OF THE STORY</p>
                <h2 id="contents-title">Contents</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowContents(false)}
                aria-label="Close contents"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="contents-list">
              {chapterTitles.map((chapter, index) => (
                <button
                  className={index === chapterIndex ? 'contents-row is-current' : 'contents-row'}
                  key={chapter}
                  onClick={() => {
                    onChangeChapter(index)
                    onChangePage(0)
                    setShowContents(false)
                  }}
                >
                  <span className="contents-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{chapter}</span>
                  <Icon name="chevron-right" size={18} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
