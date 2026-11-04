import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { NarrationChunk } from '../types'
import { createNarrationOutput, initialNarrationSnapshot, NarrationPlayer } from '../services/narrationPlayer'
import { findNarrationStart } from '../utils/narrationText'
import { supportsNarrationHighlight } from '../utils/narrationHighlight'
import Icon from './Icon'
import Waveform from './Waveform'

type Props = {
  bookId: string
  chapterIndex: number
  chapterTitle: string
  readerPage: number
  pageCount: number
  chunks: NarrationChunk[]
  progress: number
  onChangePage: (page: number) => void
  onPreviousPage: () => void
  onNextPage: () => void
  onNarrationHighlightChange?: (index: number | null) => void
}

function formatTime(time: number): string {
  if (!Number.isFinite(time)) return '--:--'
  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function ReaderBottom({
  bookId,
  chapterIndex,
  chapterTitle,
  readerPage,
  pageCount,
  chunks,
  progress,
  onChangePage,
  onPreviousPage,
  onNextPage,
  onNarrationHighlightChange,
}: Props) {
  const [snapshot, setSnapshot] = useState(initialNarrationSnapshot)
  const [followText, setFollowText] = useState(false)
  const [highlightText, setHighlightText] = useState(true)
  const [highlightSupported] = useState(supportsNarrationHighlight)
  const playerRef = useRef<NarrationPlayer | null>(null)
  const highlightedIndex = useRef<number | null>(null)
  const latest = useRef({
    chunks, readerPage, onChangePage, followText, highlightText, onNarrationHighlightChange,
  })

  useLayoutEffect(() => {
    latest.current = { chunks, readerPage, onChangePage, followText, highlightText, onNarrationHighlightChange }
  }, [chunks, readerPage, onChangePage, followText, highlightText, onNarrationHighlightChange])

  useEffect(() => () => {
    playerRef.current?.stop()
    if (highlightedIndex.current !== null) onNarrationHighlightChange?.(null)
  }, [onNarrationHighlightChange])

  const notifyHighlight = (index: number | null) => {
    if (index === highlightedIndex.current) return
    highlightedIndex.current = index
    latest.current.onNarrationHighlightChange?.(index)
  }

  const busy = snapshot.state === 'loading' || snapshot.state === 'buffering'
  const active = busy || snapshot.state === 'playing' || snapshot.state === 'paused'
  const canPause = busy || snapshot.state === 'playing'

  const togglePlayback = () => {
    if (canPause) {
      playerRef.current?.pause()
      return
    }
    if (snapshot.state === 'paused') {
      void playerRef.current?.resume()
      return
    }
    playerRef.current?.stop()
    const player = new NarrationPlayer(
      chunks.map((chunk) => chunk.text),
      {
        createOutput: createNarrationOutput,
        prepare: async (texts) => {
          const { prepareNarrationSequence } = await import('../services/kokoroTts')
          return prepareNarrationSequence(bookId, chapterIndex, texts, 1)
        },
        generate: async (key, text, signal, onProgress) => {
          const { getOrGenerateNarrationChunk } = await import('../services/kokoroTts')
          return getOrGenerateNarrationChunk(key, text, 1, onProgress, signal)
        },
      },
      (next) => {
        setSnapshot(next)
        notifyHighlight(highlightSupported && latest.current.highlightText ? next.audibleIndex : null)
      },
      (index) => {
        const current = latest.current
        const page = current.chunks[index]?.pageIndex
        if (current.followText && page !== undefined && page !== current.readerPage) {
          current.onChangePage(page)
        }
      },
    )
    playerRef.current = player
    void player.start(findNarrationStart(chunks, readerPage))
  }

  const stopPlayback = () => {
    playerRef.current?.stop()
    playerRef.current = null
    notifyHighlight(null)
    setSnapshot(initialNarrationSnapshot)
  }

  return (
    <div className="reader-bottom">
      <div className="audio-compact" aria-label="Chapter narration">
        <div className="audio-compact-top">
          <span>
            <small>KOKORO · WARM TONE</small>
            <strong>
              {snapshot.state === 'playing' ? 'Listening to this chapter'
                : busy ? 'Preparing narration in the background'
                  : snapshot.state === 'paused' ? 'Narration paused' : 'Listen to this chapter'}
            </strong>
          </span>
          <div className="audio-actions">
            {active && (
              <button type="button" className="audio-stop" onClick={stopPlayback} aria-label="Stop narration">
                <span className="stop-glyph" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="audio-play"
              onClick={togglePlayback}
              disabled={chunks.length === 0 && !active}
              aria-label={canPause ? 'Pause narration' : snapshot.state === 'paused' ? 'Resume narration' : 'Read this chapter aloud'}
            >
              {canPause ? <span className="pause-glyph" aria-hidden="true">Ⅱ</span> : <Icon name="play" size={16} />}
            </button>
          </div>
        </div>
        <Waveform progress={snapshot.duration > 0 ? snapshot.currentTime / snapshot.duration : 0} />
        <div className="audio-compact-meta">
          <span>{formatTime(snapshot.currentTime)}</span>
          <span role={snapshot.error ? 'alert' : 'status'}>{snapshot.error || snapshot.message}</span>
          <span title="Estimated listening time">{snapshot.duration > 0 ? `~${formatTime(snapshot.duration)}` : '--:--'}</span>
        </div>
        <div className="audio-options">
          <button type="button" className="audio-follow" aria-pressed={followText} onClick={() => setFollowText(!followText)}>
            Follow text: {followText ? 'on' : 'off'}
          </button>
          {onNarrationHighlightChange && (
            <button
              type="button"
              className="audio-follow"
              aria-pressed={highlightSupported && highlightText}
              disabled={!highlightSupported}
              title={highlightSupported ? 'Highlight the spoken passage without turning pages' : 'Text highlighting is not supported by this browser'}
              onClick={() => {
                setHighlightText(!highlightText)
                notifyHighlight(!highlightText ? snapshot.audibleIndex : null)
              }}
            >
              Highlight text: {highlightSupported ? highlightText ? 'on' : 'off' : 'unavailable'}
            </button>
          )}
          {busy && <span className="audio-loading-note">Keep reading · controls stay available</span>}
        </div>
      </div>
      <div className="reader-progress">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="reader-controls">
        <button className="page-arrow" aria-label="Previous page" onClick={() => { setFollowText(false); onPreviousPage() }}>
          <Icon name="chevron-left" size={22} />
        </button>
        <span>{chapterTitle} <i>·</i> Page {readerPage + 1} of {pageCount}</span>
        <button className="page-arrow" aria-label="Next page" onClick={() => { setFollowText(false); onNextPage() }}>
          <Icon name="chevron-right" size={22} />
        </button>
      </div>
    </div>
  )
}
