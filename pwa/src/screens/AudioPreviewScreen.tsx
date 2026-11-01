import { chapters, pageText } from '../data'
import type { Book } from '../types'
import BookCover from '../components/BookCover'
import Icon from '../components/Icon'
import Waveform from '../components/Waveform'

type Props = {
  book: Book
  chapterIndex: number
  readerPage: number
  isPlaying: boolean
  speed: number
  onBack: () => void
  onTogglePlaying: () => void
  onChangeSpeed: (speed: number) => void
}

export default function AudioPreviewScreen({
  book,
  chapterIndex,
  readerPage,
  isPlaying,
  speed,
  onBack,
  onTogglePlaying,
  onChangeSpeed,
}: Props) {
  return (
    <main className="subpage audio-page">
      <header className="subpage-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to reader">
          <Icon name="chevron-left" />
        </button>
        <span>Audio preview</span>
        <span className="header-balance" />
      </header>
      <section className="audio-content">
        <p className="eyebrow">A LISTENING COMPANION</p>
        <BookCover book={book} featured />
        <h1>{chapters[chapterIndex]}</h1>
        <p className="audio-book-title">
          {book.title} <span>by {book.author}</span>
        </p>
        <Waveform progress={isPlaying ? 0.26 : 0} />
        <div className="audio-timeline">
          <span>{isPlaying ? 'Speaking' : 'Ready when you are'}</span>
          <span>{isPlaying ? '00:18 / 02:46' : '--:--'}</span>
        </div>
        <div className="playback-card">
          <button
            className="large-play-button"
            onClick={onTogglePlaying}
            aria-label={isPlaying ? 'Pause reading aloud' : 'Start reading aloud'}
          >
            {isPlaying ? <span className="pause-glyph">Ⅱ</span> : <Icon name="play" size={20} />}
          </button>
          <div>
            <strong>{isPlaying ? 'Reading aloud' : 'Listen to this book'}</strong>
            <p>Browser voice reads along and turns the page for you.</p>
          </div>
        </div>
        <div className="voice-settings">
          <div className="voice-row">
            <div>
              <span className="eyebrow">VOICE</span>
              <strong>Browser voice · English</strong>
            </div>
            <Icon name="chevron-right" size={18} />
          </div>
          <div className="settings-divider" />
          <div className="speed-heading">
            <span className="eyebrow">READING SPEED</span>
            <strong>{speed.toFixed(1)}×</strong>
          </div>
          <div className="speed-options">
            {[0.8, 1, 1.2, 1.5].map((option) => (
              <button
                key={option}
                className={speed === option ? 'speed-option is-selected' : 'speed-option'}
                onClick={() => onChangeSpeed(option)}
              >
                {option.toFixed(1)}×
              </button>
            ))}
          </div>
        </div>
        <div className="excerpt-block">
          <p className="eyebrow">FROM THIS CHAPTER</p>
          <p>“{pageText[readerPage]}”</p>
        </div>
      </section>
    </main>
  )
}
