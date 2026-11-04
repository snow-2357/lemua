import { useCallback, useEffect, useRef, useState } from 'react'
import type { NarrationChunk } from '../types'
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
}: Props) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [status, setStatus] = useState('Tap play to read along')
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(Number.NaN)
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioUrlRef = useRef<string | null>(null)
  const sequenceKeysRef = useRef<string[]>([])
  const chunkIndexRef = useRef(-1)
  const generationId = useRef(0)

  useEffect(() => {
    const player = audioRef.current
    return () => {
      generationId.current += 1
      player?.pause()
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    }
  }, [])

  const showPlaybackError = (playbackError: unknown) => {
    console.error('Could not generate or play Kokoro narration.', playbackError)
    setError(
      playbackError instanceof Error
        ? playbackError.message
        : 'Could not generate audio on this device.',
    )
    setStatus('Tap play to try again')
    setIsPlaying(false)
    setIsGenerating(false)
  }

  const prefetchNextChunks = useCallback(
    (currentIndex: number, requestId: number) => {
      const endIndex = Math.min(chunks.length, currentIndex + 5)
      const queuedChunks = chunks
        .map((chunk, index) => ({ chunk, index }))
        .filter(({ index }) => index > currentIndex && index < endIndex)
      if (queuedChunks.length === 0) return

      void import('../services/kokoroTts')
        .then(({ getOrGenerateNarrationChunk }) =>
          Promise.all(
            queuedChunks.map(({ chunk, index }) => {
              const key = sequenceKeysRef.current[index]
              if (!key) return Promise.resolve()
              return getOrGenerateNarrationChunk(key, chunk.text, 1, () => {}).catch(
                (prefetchError: unknown) => {
                  if (requestId === generationId.current) {
                    console.error(`Could not prepare narration passage ${index + 1}.`, prefetchError)
                    setError(
                      prefetchError instanceof Error
                        ? `Could not prepare passage ${index + 1}: ${prefetchError.message}`
                        : `Could not prepare passage ${index + 1}.`,
                    )
                  }
                },
              )
            }),
          ),
        )
        .catch((prefetchError: unknown) => {
          if (requestId === generationId.current) showPlaybackError(prefetchError)
        })
    },
    [chunks],
  )

  const playChunk = useCallback(async (index: number, requestId: number) => {
    const player = audioRef.current
    const chunk = chunks[index]
    const chunkKey = sequenceKeysRef.current[index]
    if (!player || !chunk || !chunkKey) return

    setIsGenerating(true)
    setStatus(`Preparing passage ${index + 1} of ${chunks.length}…`)
    try {
      const { getOrGenerateNarrationChunk } = await import('../services/kokoroTts')
      const audio = await getOrGenerateNarrationChunk(chunkKey, chunk.text, 1, setStatus)
      if (requestId !== generationId.current) return

      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
      const url = URL.createObjectURL(audio)
      audioUrlRef.current = url
      chunkIndexRef.current = index
      setAudioUrl(url)
      setCurrentTime(0)
      setDuration(Number.NaN)
      player.src = url
      player.load()
      await player.play()
      prefetchNextChunks(index, requestId)
    } catch (playbackError) {
      if (requestId === generationId.current) showPlaybackError(playbackError)
    } finally {
      if (requestId === generationId.current) setIsGenerating(false)
    }
  }, [chunks, prefetchNextChunks])

  const togglePlayback = async () => {
    const player = audioRef.current
    if (!player || isGenerating) return
    setError('')

    if (audioUrl) {
      if (player.paused) {
        try {
          await player.play()
        } catch (playError) {
          console.error('Could not play generated Kokoro audio.', playError)
          setError('Could not play the generated audio. Please try again.')
        }
      } else {
        player.pause()
      }
      return
    }

    if (chunks.length === 0) {
      setError('There is no readable text in this chapter to play.')
      return
    }

    setIsGenerating(true)
    const requestId = ++generationId.current
    try {
      setStatus('Remembering this chapter’s narration order…')
      const { prepareNarrationSequence } = await import('../services/kokoroTts')
      const sequence = await prepareNarrationSequence(
        bookId,
        chapterIndex,
        chunks.map((chunk) => chunk.text),
        1,
      )
      if (requestId !== generationId.current) return
      sequenceKeysRef.current = sequence.chunkKeys
      const startIndex = chunks.findIndex((chunk) => chunk.pageIndex >= readerPage)
      await playChunk(startIndex < 0 ? 0 : startIndex, requestId)
    } catch (playbackError) {
      if (requestId === generationId.current) showPlaybackError(playbackError)
    } finally {
      if (requestId === generationId.current) setIsGenerating(false)
    }
  }

  const playNextChunk = useCallback(() => {
    const nextIndex = chunkIndexRef.current + 1
    const nextChunk = chunks[nextIndex]
    if (!nextChunk) {
      setIsPlaying(false)
      setStatus('Chapter finished · tap play to replay the last passage')
      return
    }

    if (nextChunk.pageIndex !== readerPage) onChangePage(nextChunk.pageIndex)
    void playChunk(nextIndex, generationId.current)
  }, [chunks, onChangePage, playChunk, readerPage])

  useEffect(() => {
    const player = audioRef.current
    if (!player) return

    const handleEnded = () => {
      player.currentTime = 0
      setCurrentTime(0)
      playNextChunk()
    }
    player.addEventListener('ended', handleEnded)
    return () => player.removeEventListener('ended', handleEnded)
  }, [playNextChunk])

  return (
    <div className="reader-bottom">
      <div className="audio-compact">
        <span className="audio-compact-top">
          <span>
            <small>KOKORO · WARM TONE</small>
            <strong>{isGenerating ? 'Preparing this passage' : 'Listen to this chapter'}</strong>
          </span>
          <button
            type="button"
            className="audio-play"
            onClick={() => void togglePlayback()}
            disabled={isGenerating}
            aria-label={
              isGenerating
                ? 'Generating audio'
                : isPlaying
                  ? 'Pause narration'
                  : audioUrl
                    ? 'Play narration'
                    : 'Read this chapter aloud'
            }
          >
            {isPlaying ? <span className="pause-glyph">Ⅱ</span> : <Icon name="play" size={16} />}
          </button>
        </span>
        <Waveform
          progress={Number.isFinite(duration) && duration > 0 ? currentTime / duration : 0}
        />
        <span className="audio-compact-meta">
          <span>{formatTime(currentTime)}</span>
          <span aria-live="polite">{error || status}</span>
          <span>{formatTime(duration)}</span>
        </span>
        <audio
          ref={audioRef}
          hidden
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onPlay={() => {
            setIsPlaying(true)
            setStatus('Reading this page aloud')
          }}
          onPause={(event) => {
            setIsPlaying(false)
            if (!event.currentTarget.ended) setStatus('Narration paused')
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime)
          }}
        />
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
