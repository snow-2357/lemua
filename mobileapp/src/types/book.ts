export type Book = {
  id: string;
  title: string;
  author: string;
  color: string;
  mark: string;
  uri?: string;
  lastOpenedAt?: number;
  contentHash?: string;
  readingChapterIndex?: number;
  readingTextOffset?: number;
  readingProgress?: number;
}

export type ReaderState = {
  book: Book;
  epub: EpubDocument;
  tableOfContents: TableOfContentsEntry[];
  chapterIndex: number;
  isPreview: boolean;
};

export type EpubDocument = {
  title?: string;
  author?: string;
  chapterCount: number;
  tableOfContents: TableOfContentsEntry[];
  loadChapter: (chapterIndex: number) => Promise<ReaderChapter>;
};

export type ReaderChapter = {
  title: string;
  text: string;
  images?: ReaderImage[];
  anchors?: Record<string, number>;
};

export type ReaderImage = {
  uri?: string;
  textOffset: number;
  alt: string;
};

export type TableOfContentsEntry = {
  title: string;
  chapterIndex: number;
  textOffset?: number;
  fragment?: string;
};
