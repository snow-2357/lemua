import Icon from './Icon'
import Waveform from './Waveform'

type Props = {
  chapterTitle: string
  readerPage: number
  pageCount: number
  progress: number
  onPreviousPage: () => void
  onNextPage: () => void
}

export default function ReaderBottom({
  chapterTitle,
  readerPage,
  pageCount,
  progress,
  onPreviousPage,
  onNextPage,
}: Props) {
  return (
    <div className="reader-bottom">
      <div className="audio-compact">
        <span className="audio-compact-top">
          <span>
            <small>KOKORO · WARM TONE</small>
            <strong>Listen to this page</strong>
          </span>
          <span className="audio-play">
            <Icon name="play" size={16} />
          </span>
        </span>
        <Waveform />
        <span className="audio-compact-meta">
          <span>00:00</span>
          <span>Open audio preview</span>
          <span>--:--</span>
        </span>
      </div>
      <div className="reader-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="reader-controls">
        <button className="page-arrow" aria-label="Previous page" onClick={onPreviousPage}>
          <Icon name="chevron-left" size={22} />
        </button>
        <span>
          {chapterTitle} <i>·</i> Page {readerPage + 1} of {pageCount}
        </span>
        <button className="page-arrow" aria-label="Next page" onClick={onNextPage}>
          <Icon name="chevron-right" size={22} />
        </button>
      </div>
    </div>
  )
}
