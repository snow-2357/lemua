export type Book = {
  id: string
  title: string
  author: string
  color: string
  mark: string
  progress: number
  subtitle: string
  isEpub?: boolean
}

export type EpubChapter = {
  title: string
  paragraphs: string[]
}

export type NarrationChunk = {
  text: string
  pageIndex: number
}

export type ImportedBook = Book & {
  isEpub: true
  file: Blob
  chapters: EpubChapter[]
  epubParserVersion?: number
  fileFingerprint?: string
  lastReadAt?: number
  lastChapterIndex?: number
  lastReaderPage?: number
}

export type IconName =
  | 'book'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'moon'
  | 'more'
  | 'play'
  | 'plus'
  | 'search'
  | 'sparkle'
  | 'sun'
