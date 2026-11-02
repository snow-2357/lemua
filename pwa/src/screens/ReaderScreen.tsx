import { useEffect, useRef, useState } from 'react'
import type { Book } from '../types'
import Icon from '../components/Icon'
import Waveform from '../components/Waveform'
import { truncateText } from '../utils/truncateText'

type PageParagraph = {
  text: string
  continues: boolean
  complete: boolean
}

function wrapParagraph(
  paragraph: string,
  measure: (text: string) => number,
  maxWidth: number,
): string[] {
  const words = paragraph.trim().split(/\s+/)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && measure(candidate) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }

  if (line) lines.push(line)
  return lines
}

function paginateParagraphs(
  paragraphs: string[],
  measure: (text: string) => number,
  maxWidth: number,
  lineHeight: number,
  paragraphGap: number,
  firstPageHeight: number,
  otherPageHeight: number,
): PageParagraph[][] {
  const pages: PageParagraph[][] = [[]]
  let availableHeight = firstPageHeight

  for (const paragraph of paragraphs) {
    const lines = wrapParagraph(paragraph, measure, maxWidth)
    let lineIndex = 0

    while (lineIndex < lines.length) {
      const fittingLines = Math.floor(availableHeight / lineHeight)
      if (fittingLines < 1) {
        pages.push([])
        availableHeight = otherPageHeight
        continue
      }

      const endIndex = Math.min(lineIndex + fittingLines, lines.length)
      const complete = endIndex === lines.length
      pages[pages.length - 1].push({
        text: lines.slice(lineIndex, endIndex).join('\n'),
        continues: lineIndex > 0,
        complete,
      })
      availableHeight -= (endIndex - lineIndex) * lineHeight
      lineIndex = endIndex

      if (complete) {
        availableHeight -= paragraphGap
      } else {
        pages.push([])
        availableHeight = otherPageHeight
      }
    }
  }

  return pages.length > 1 && pages[pages.length - 1].length === 0
    ? pages.slice(0, -1)
    : pages
}

type Props = {
  book: Book
  chapterTitles: string[]
  chapterParagraphs: string[]
  chapterIndex: number
  readerPage: number
  onPageCountChange: (count: number) => void
  onPageTextChange: (text: string) => void
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
  onPageCountChange,
  onPageTextChange,
  progress,
  onBack,
  onOpenAudio,
  onChangeChapter,
  onChangePage,
}: Props) {
  const [showContents, setShowContents] = useState(false)
  const [pages, setPages] = useState<PageParagraph[][]>([[]])
  const readingViewport = useRef<HTMLDivElement>(null)
  const measurementText = useRef<HTMLParagraphElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)
  const onChangePageRef = useRef(onChangePage)
  const onPageCountChangeRef = useRef(onPageCountChange)
  const onPageTextChangeRef = useRef(onPageTextChange)
  const readerPageRef = useRef(readerPage)
  const layoutSignature = useRef('')

  useEffect(() => {
    onChangePageRef.current = onChangePage
  }, [onChangePage])

  useEffect(() => {
    onPageCountChangeRef.current = onPageCountChange
  }, [onPageCountChange])

  useEffect(() => {
    onPageTextChangeRef.current = onPageTextChange
  }, [onPageTextChange])

  useEffect(() => {
    readerPageRef.current = readerPage
  }, [readerPage])

  useEffect(() => {
    const viewport = readingViewport.current
    const sample = measurementText.current
    if (!viewport || !sample) return

    const measurePages = () => {
      const firstPage = viewport.querySelector<HTMLElement>('.reading-page')
      if (!firstPage || viewport.clientWidth === 0 || viewport.clientHeight === 0) {
        return
      }

      const pageStyle = window.getComputedStyle(firstPage)
      const textStyle = window.getComputedStyle(sample)
      const pageWidth =
        viewport.clientWidth -
        Number.parseFloat(pageStyle.paddingLeft) -
        Number.parseFloat(pageStyle.paddingRight)
      const lineHeight = Number.parseFloat(textStyle.lineHeight)
      const paragraphGap = Number.parseFloat(textStyle.marginBottom)
      const verticalPadding =
        Number.parseFloat(pageStyle.paddingTop) +
        Number.parseFloat(pageStyle.paddingBottom)
      const headingHeight = headingRef.current?.getBoundingClientRect().height ?? 0
      if (pageWidth <= 0 || lineHeight <= 0) return

      const signature = [
        chapterIndex,
        viewport.clientWidth,
        viewport.clientHeight,
        textStyle.font,
        chapterParagraphs.length,
      ].join(':')
      if (signature === layoutSignature.current) return
      layoutSignature.current = signature

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) {
        console.error('Could not measure reader text for pagination.')
        return
      }
      context.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`
      const nextPages = paginateParagraphs(
        chapterParagraphs,
        (text) => context.measureText(text).width,
        pageWidth,
        lineHeight,
        paragraphGap,
        viewport.clientHeight - verticalPadding - headingHeight,
        viewport.clientHeight - verticalPadding,
      )
      setPages(nextPages)
      onPageCountChangeRef.current(nextPages.length)
      if (readerPageRef.current >= nextPages.length) {
        onChangePageRef.current(nextPages.length - 1)
      } else {
        viewport.scrollLeft = readerPageRef.current * viewport.clientWidth
      }
    }

    const observer = new ResizeObserver(measurePages)
    observer.observe(viewport)
    if (headingRef.current) observer.observe(headingRef.current)
    const timer = window.setTimeout(measurePages, 0)

    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [chapterIndex, chapterParagraphs])

  useEffect(() => {
    const viewport = readingViewport.current
    if (viewport) viewport.scrollLeft = readerPage * viewport.clientWidth
  }, [readerPage, pages.length])

  useEffect(() => {
    const text = pages[readerPage]
      ?.map((paragraph) => paragraph.text.replace(/\n/g, ' '))
      .join(' ') ?? ''
    onPageTextChangeRef.current(text)
  }, [pages, readerPage])

  const previousPage = () => {
    if (readerPage > 0) onChangePage(readerPage - 1)
    else if (chapterIndex > 0) onChangeChapter(chapterIndex - 1)
  }

  const nextPage = () => {
    if (readerPage < pages.length - 1) onChangePage(readerPage + 1)
    else onChangeChapter((chapterIndex + 1) % chapterTitles.length)
  }

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
        <div className="reading-viewport" ref={readingViewport}>
          <div
            className="reading-pages"
          >
            {pages.map((page, pageIndex) => (
              <article className="reading-page" key={`${chapterIndex}-${pageIndex}`}>
                {pageIndex === 0 && (
                  <div className="chapter-heading" ref={headingRef}>
                    <div className="chapter-label">
                      CHAPTER {String(chapterIndex + 1).padStart(2, '0')}
                    </div>
                    <h1>{chapterTitles[chapterIndex]}</h1>
                    <div className="chapter-rule"><span>✦</span></div>
                  </div>
                )}
                {page.map((paragraph, index) => (
                  <p
                    className={[
                      'reading-text',
                      paragraph.continues ? 'is-continuation' : '',
                      paragraph.complete ? '' : 'is-split',
                    ].filter(Boolean).join(' ')}
                    key={`${chapterIndex}-${pageIndex}-${index}`}
                  >
                    {paragraph.text}
                  </p>
                ))}
              </article>
            ))}
          </div>
          <p className="reader-measure-text reading-text" ref={measurementText}>
            Measure text
          </p>
          <span className="page-number">{String(readerPage + 1).padStart(2, '0')}</span>
        </div>
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
            {chapterTitles[chapterIndex]} <i>·</i> Page {readerPage + 1} of {pages.length}
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
