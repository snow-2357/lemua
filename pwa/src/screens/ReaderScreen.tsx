import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import HTMLFlipBook from 'react-pageflip'
import type { Book } from '../types'
import ReaderBottom from '../components/ReaderBottom'
import Icon from '../components/Icon'
import { truncateText } from '../utils/truncateText'
import { createNarrationChunks } from '../utils/narrationText'

type PageFlipApi = {
  flipNext: () => void
  flipPrev: () => void
  turnToPage: (page: number) => void
  getCurrentPageIndex: () => number
}

type PageFlipHandle = {
  pageFlip: () => PageFlipApi | undefined
}

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
    if (!line && measure(word) > maxWidth) {
      let chunk = ''
      for (const character of word) {
        if (chunk && measure(chunk + character) > maxWidth) {
          lines.push(chunk)
          chunk = character
        } else {
          chunk += character
        }
      }
      line = chunk
      continue
    }

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

  return pages.length > 1 && pages[pages.length - 1].length === 0 ? pages.slice(0, -1) : pages
}

type Props = {
  book: Book
  chapterTitles: string[]
  chapterParagraphs: string[]
  chapterIndex: number
  chapterPageCounts: Record<number, number>
  readerPage: number
  onPageCountChange: (count: number) => void
  progress: number
  onBack: () => void
  onChangeChapter: (index: number, page?: number) => void
  onChangePage: (page: number) => void
}

export default function ReaderScreen({
  book,
  chapterTitles,
  chapterParagraphs,
  chapterIndex,
  chapterPageCounts,
  readerPage,
  onPageCountChange,
  progress,
  onBack,
  onChangeChapter,
  onChangePage,
}: Props) {
  const [showContents, setShowContents] = useState(false)
  const [paginatedChapter, setPaginatedChapter] = useState<{
    index: number
    pages: PageParagraph[][]
  } | null>(null)
  const [flipSize, setFlipSize] = useState({ width: 0, height: 0 })
  const [flipBookRevision, setFlipBookRevision] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const readingViewport = useRef<HTMLDivElement>(null)
  const measurementText = useRef<HTMLParagraphElement>(null)
  const measurementPage = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLDivElement>(null)
  const flipBookRef = useRef<PageFlipHandle>(null)
  const onChangePageRef = useRef(onChangePage)
  const onPageCountChangeRef = useRef(onPageCountChange)
  const readerPageRef = useRef(readerPage)
  const chapterIndexRef = useRef(chapterIndex)
  const flipBookRevisionRef = useRef(flipBookRevision)
  const layoutSignature = useRef('')
  const pages = useMemo(
    () => (paginatedChapter?.index === chapterIndex ? paginatedChapter.pages : []),
    [chapterIndex, paginatedChapter],
  )
  const narrationChunks = useMemo(
    () => createNarrationChunks(chapterParagraphs, pages),
    [chapterParagraphs, pages],
  )

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setPrefersReducedMotion(motionPreference.matches)
    updateMotionPreference()
    motionPreference.addEventListener('change', updateMotionPreference)

    return () => motionPreference.removeEventListener('change', updateMotionPreference)
  }, [])

  useEffect(() => {
    onChangePageRef.current = onChangePage
  }, [onChangePage])

  useEffect(() => {
    onPageCountChangeRef.current = onPageCountChange
  }, [onPageCountChange])

  useLayoutEffect(() => {
    readerPageRef.current = readerPage
    chapterIndexRef.current = chapterIndex
    flipBookRevisionRef.current = flipBookRevision
  }, [chapterIndex, flipBookRevision, readerPage])

  const changeChapter = (index: number, page = 0) => {
    const nextRevision = flipBookRevisionRef.current + 1
    flipBookRevisionRef.current = nextRevision
    setFlipBookRevision(nextRevision)
    onChangeChapter(index, page)
  }

  useEffect(() => {
    const viewport = readingViewport.current
    const sample = measurementText.current
    const page = measurementPage.current
    if (!viewport || !sample || !page) return

    const measurePages = () => {
      if (viewport.clientWidth === 0 || viewport.clientHeight === 0) {
        return
      }

      const pageStyle = window.getComputedStyle(page)
      const textStyle = window.getComputedStyle(sample)
      setFlipSize((currentSize) =>
        currentSize.width === viewport.clientWidth && currentSize.height === viewport.clientHeight
          ? currentSize
          : { width: viewport.clientWidth, height: viewport.clientHeight },
      )
      const pageWidth =
        viewport.clientWidth -
        Number.parseFloat(pageStyle.paddingLeft) -
        Number.parseFloat(pageStyle.paddingRight)
      const lineHeight = Number.parseFloat(textStyle.lineHeight)
      const paragraphGap = Number.parseFloat(textStyle.marginBottom)
      const verticalPadding =
        Number.parseFloat(pageStyle.paddingTop) + Number.parseFloat(pageStyle.paddingBottom)
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
      setPaginatedChapter({ index: chapterIndex, pages: nextPages })
      onPageCountChangeRef.current(nextPages.length)
      if (readerPageRef.current >= nextPages.length) {
        onChangePageRef.current(nextPages.length - 1)
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
    const flipBook = flipBookRef.current?.pageFlip()
    if (flipBook && readerPage < pages.length && flipBook.getCurrentPageIndex() !== readerPage) {
      flipBook.turnToPage(readerPage)
    }
  }, [readerPage, pages.length, flipSize])

  const previousPage = () => {
    if (readerPage > 0) {
      const flipBook = flipBookRef.current?.pageFlip()
      if (flipBook) flipBook.flipPrev()
      else onChangePage(readerPage - 1)
    } else if (chapterIndex > 0) {
      const previousChapter = chapterIndex - 1
      const previousChapterPageCount = chapterPageCounts[previousChapter] ?? 1
      changeChapter(previousChapter, previousChapterPageCount - 1)
    }
  }

  const nextPage = () => {
    if (readerPage < pages.length - 1) {
      const flipBook = flipBookRef.current?.pageFlip()
      if (flipBook) flipBook.flipNext()
      else onChangePage(readerPage + 1)
    } else {
      changeChapter((chapterIndex + 1) % chapterTitles.length)
    }
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
          <Icon name="book" size={16} />
          <span>Contents</span>
        </button>
      </header>
      <section className="reading-area">
        <div className="reading-viewport" ref={readingViewport}>
          {flipSize.width > 0 && flipSize.height > 0 && pages.length > 0 && (
            <HTMLFlipBook
              key={`${chapterIndex}-${flipBookRevision}-${flipSize.width}-${flipSize.height}`}
              className="reading-book"
              style={{ width: '100%', height: '100%' }}
              ref={flipBookRef}
              width={flipSize.width}
              height={flipSize.height}
              size="stretch"
              minWidth={flipSize.width}
              maxWidth={flipSize.width}
              minHeight={flipSize.height}
              maxHeight={flipSize.height}
              startPage={Math.min(readerPage, pages.length - 1)}
              drawShadow
              flippingTime={prefersReducedMotion ? 1 : 650}
              usePortrait
              startZIndex={0}
              autoSize={false}
              maxShadowOpacity={0.28}
              showCover={false}
              mobileScrollSupport
              clickEventForward
              useMouseEvents
              swipeDistance={30}
              showPageCorners={false}
              disableFlipByClick={false}
              onFlip={(event: { data: number }) => {
                if (
                  chapterIndexRef.current === chapterIndex &&
                  flipBookRevisionRef.current === flipBookRevision
                ) {
                  onChangePageRef.current(event.data)
                }
              }}
            >
              {pages.map((page, pageIndex) => (
                <article className="reading-page" key={`${chapterIndex}-${pageIndex}`}>
                  {pageIndex === 0 && (
                    <div className="chapter-heading">
                      <h1>{chapterTitles[chapterIndex]}</h1>
                      <div className="chapter-rule">
                        <span>✦</span>
                      </div>
                    </div>
                  )}
                  {page.map((paragraph, index) => (
                    <p
                      className={[
                        'reading-text',
                        paragraph.continues ? 'is-continuation' : '',
                        paragraph.complete ? '' : 'is-split',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={`${chapterIndex}-${pageIndex}-${index}`}
                    >
                      {paragraph.text}
                    </p>
                  ))}
                </article>
              ))}
            </HTMLFlipBook>
          )}
          <article
            className="reading-page reader-measure-page"
            ref={measurementPage}
            aria-hidden="true"
          >
            <div className="chapter-heading" ref={headingRef}>
              <h1>{chapterTitles[chapterIndex]}</h1>
              <div className="chapter-rule">
                <span>✦</span>
              </div>
            </div>
            <p className="reader-measure-text reading-text" ref={measurementText}>
              Measure text
            </p>
          </article>
          <span className="page-number">{String(readerPage + 1).padStart(2, '0')}</span>
        </div>
      </section>
      <ReaderBottom
        key={`${book.id}:${chapterIndex}`}
        bookId={book.id}
        chapterIndex={chapterIndex}
        chapterTitle={chapterTitles[chapterIndex]}
        readerPage={readerPage}
        pageCount={pages.length}
        chunks={narrationChunks}
        progress={progress}
        onChangePage={onChangePage}
        onPreviousPage={previousPage}
        onNextPage={nextPage}
      />
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
                  key={`${index}-${chapter}`}
                  onClick={() => {
                    changeChapter(index)
                    setShowContents(false)
                  }}
                >
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
