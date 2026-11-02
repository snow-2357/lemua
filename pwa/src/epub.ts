import { strFromU8, unzipSync } from 'fflate'
import type { EpubChapter, ImportedBook } from './types'

const maxArchiveSize = 100 * 1024 * 1024
const maxExpandedTextSize = 40 * 1024 * 1024
const maxEntrySize = 12 * 1024 * 1024
const maxTextEntries = 1000
const coverColors = ['#849887', '#a9857d', '#9386a3', '#8799a8', '#aa966d']
const coverMarks = ['✦', '❋', '◈', '❦', '✿']

function parseXml(source: string, label: string): Document {
  const document = new DOMParser().parseFromString(source, 'application/xml')
  if (document.querySelector('parsererror')) {
    throw new Error(`This EPUB has invalid ${label}.`)
  }
  return document
}

function localNameElements(root: ParentNode, name: string): Element[] {
  return Array.from(root.querySelectorAll('*')).filter(
    (element) => element.localName.toLowerCase() === name.toLowerCase(),
  )
}

function resolveArchivePath(basePath: string, href: string): string {
  const cleanHref = href.split(/[?#]/, 1)[0]
  const path = new URL(cleanHref, `https://epub.invalid/${basePath}`).pathname
  return decodeURIComponent(path.replace(/^\/+/, ''))
}

function getNavigationTitles(
  archive: ReturnType<typeof unzipSync>,
  manifest: Map<string, { href: string; properties: string; mediaType: string }>,
  packageDirectory: string,
): Map<string, string> {
  const titles = new Map<string, string>()

  for (const item of manifest.values()) {
    const isNcx = item.mediaType === 'application/x-dtbncx+xml' || /\.ncx$/i.test(item.href)
    if (!isNcx && !item.properties.split(/\s+/).includes('nav')) continue

    const navigationPath = resolveArchivePath(packageDirectory, item.href)
    const navigationFile = archive[navigationPath]
    if (!navigationFile) continue

    const addTitle = (href: string, title: string) => {
      const normalizedTitle = title.replace(/\s+/g, ' ').trim()
      if (!href || !normalizedTitle) return
      const targetPath = resolveArchivePath(
        navigationPath.slice(0, navigationPath.lastIndexOf('/') + 1),
        href,
      )
      if (!titles.has(targetPath)) titles.set(targetPath, normalizedTitle)
    }

    if (isNcx) {
      const document = parseXml(strFromU8(navigationFile), 'table of contents')
      for (const point of localNameElements(document, 'navPoint')) {
        const label = localNameElements(point, 'navLabel')[0]
        const title = label && localNameElements(label, 'text')[0]?.textContent
        const href = localNameElements(point, 'content')[0]?.getAttribute('src')
        if (href && title) addTitle(href, title)
      }
      continue
    }

    const document = new DOMParser().parseFromString(
      strFromU8(navigationFile),
      'text/html',
    )
    const navigation = Array.from(document.querySelectorAll('nav')).find((element) =>
      Array.from(element.attributes).some((attribute) => {
        const name = attribute.localName.toLowerCase()
        const values = attribute.value.toLowerCase().split(/\s+/)
        return (
          (name === 'type' && values.includes('toc')) ||
          (name === 'role' && values.includes('doc-toc'))
        )
      }),
    ) ?? document.querySelector('nav')
    for (const link of navigation?.querySelectorAll('a[href]') ?? []) {
      addTitle(link.getAttribute('href') ?? '', link.textContent ?? '')
    }
  }

  return titles
}

function isStandaloneUrl(text: string): boolean {
  const value = text.trim().replace(/^[[(<{]+|[)\]}>.,;!?]+$/g, '')
  return /^(?:(?:https?|ftp):\/\/|www\.)\S+$/i.test(value) ||
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i.test(value)
}

function filterStandaloneUrls(paragraphs: string[]): string[] {
  return paragraphs.filter((paragraph) => !isStandaloneUrl(paragraph))
}

function makeParagraphs(document: Document): string[] {
  document.querySelectorAll('script, style, noscript, svg').forEach((element) => {
    element.remove()
  })

  const paragraphs = Array.from(document.querySelectorAll('p'))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((paragraph) => paragraph && !isStandaloneUrl(paragraph))

  if (paragraphs.length > 0) return paragraphs

  const blocks = Array.from(document.querySelectorAll('blockquote, li'))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter((paragraph) => paragraph && !isStandaloneUrl(paragraph))
  if (blocks.length > 0) return blocks

  const text = document.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  return filterStandaloneUrls(text ? [text] : [])
}

function getMetadataValue(document: Document, name: string): string | undefined {
  return localNameElements(document, name)
    .map((element) => element.textContent?.trim())
    .find((value): value is string => Boolean(value))
}

export function isContentsChapterTitle(title: string): boolean {
  return /^(?:table of )?contents(?: page)?$/i.test(title.replace(/\s+/g, ' ').trim())
}

function isNonNarrativeSectionTitle(title: string, bookTitle: string): boolean {
  const normalizedTitle = title.replace(/\s+/g, ' ').trim()
  return (
    isContentsChapterTitle(normalizedTitle) ||
    normalizedTitle.localeCompare(bookTitle.trim(), undefined, {
      sensitivity: 'accent',
    }) === 0 ||
    /^(?:cover(?: page)?|title page|critical acclaim\b|other books by\b|front ?matter\b|dedication\b|epigram\b|copyright\b|acknowledg(?:e)?ments\b|titles available\b|about the author\b|part\s+\d+\b)/i.test(
      normalizedTitle,
    )
  )
}

function isContentsDocument(document: Document): boolean {
  const hasTocSemantics = Array.from(document.querySelectorAll('*')).some((element) =>
    Array.from(element.attributes).some((attribute) => {
      const name = attribute.localName.toLowerCase()
      const value = attribute.value.toLowerCase()
      const values = value.split(/\s+/)
      return (
        (name === 'type' && values.includes('toc')) ||
        (name === 'role' && values.includes('doc-toc')) ||
        ((name === 'id' || name === 'class' || name === 'aria-label') &&
          /(?:^|[^a-z0-9])(?:toc|table[\s_-]?of[\s_-]?contents?)(?:$|[^a-z0-9])/.test(value))
      )
    }),
  )
  if (hasTocSemantics) return true

  const heading = document.querySelector('h1, h2, h3, h4, h5, h6')?.textContent
    ?.replace(/\s+/g, ' ')
    .trim()
  if (isContentsChapterTitle(heading ?? '') || isContentsChapterTitle(document.title)) {
    return true
  }

  return false
}

export async function parseEpub(file: File): Promise<ImportedBook> {
  if (!file.name.toLowerCase().endsWith('.epub')) {
    throw new Error('Choose a file with the .epub extension.')
  }
  if (file.size === 0 || file.size > maxArchiveSize) {
    throw new Error('The EPUB must be nonempty and smaller than 100 MB.')
  }

  let expandedTextSize = 0
  let textEntryCount = 0
  let exceededArchiveLimits = false
  let archive: ReturnType<typeof unzipSync>
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: (entry) => {
        const isTextFile =
          entry.name === 'mimetype' ||
          /(?:^|\/)container\.xml$/i.test(entry.name) ||
          /\.(?:opf|ncx|xhtml|html|htm)$/i.test(entry.name)
        if (!isTextFile) return false

        textEntryCount += 1
        expandedTextSize += entry.originalSize
        if (
          entry.originalSize > maxEntrySize ||
          expandedTextSize > maxExpandedTextSize ||
          textEntryCount > maxTextEntries
        ) {
          exceededArchiveLimits = true
          return false
        }
        return true
      },
    })
  } catch (error) {
    throw new Error('This file is not a valid or readable EPUB archive.', {
      cause: error,
    })
  }
  if (exceededArchiveLimits) {
    throw new Error('The EPUB contains too much text to import safely.')
  }

  const containerFile = archive['META-INF/container.xml']
  if (!containerFile) throw new Error('This file is missing EPUB container metadata.')

  const container = parseXml(strFromU8(containerFile), 'container metadata')
  const packagePath = localNameElements(container, 'rootfile')[0]?.getAttribute(
    'full-path',
  )
  if (!packagePath) throw new Error('This EPUB does not identify its book content.')

  const normalizedPackagePath = decodeURIComponent(packagePath.replace(/^\/+/, ''))
  const packageFile = archive[normalizedPackagePath]
  if (!packageFile) throw new Error('This EPUB is missing its book package.')

  const packageDocument = parseXml(strFromU8(packageFile), 'book metadata')
  const manifest = new Map(
    localNameElements(packageDocument, 'item').map((item) => [
      item.getAttribute('id') ?? '',
      {
        href: item.getAttribute('href') ?? '',
        properties: item.getAttribute('properties') ?? '',
        mediaType: item.getAttribute('media-type') ?? '',
      },
    ]),
  )
  const packageDirectory = normalizedPackagePath.slice(
    0,
    normalizedPackagePath.lastIndexOf('/') + 1,
  )
  const bookTitle =
    getMetadataValue(packageDocument, 'title') ||
    file.name.replace(/\.epub$/i, '')
  const author = getMetadataValue(packageDocument, 'creator') || 'Unknown author'
  const navigationTitles = getNavigationTitles(archive, manifest, packageDirectory)
  const chapters: EpubChapter[] = []

  for (const itemRef of localNameElements(packageDocument, 'itemref')) {
    const item = manifest.get(itemRef.getAttribute('idref') ?? '')
    if (!item || item.properties.split(/\s+/).includes('nav')) continue

    const chapterPath = resolveArchivePath(packageDirectory, item.href)
    const chapterFile = archive[chapterPath]
    if (!chapterFile) continue
    if (navigationTitles.size > 0 && !navigationTitles.has(chapterPath)) continue

    const document = new DOMParser().parseFromString(
      strFromU8(chapterFile),
      'text/html',
    )
    if (isContentsDocument(document)) continue

    const heading = document
      .querySelector('h1, h2, h3, h4, h5, h6')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim()
    const chapterTitle =
      navigationTitles.get(chapterPath) || heading || document.title.trim()
    if (isNonNarrativeSectionTitle(chapterTitle, bookTitle)) continue
    const paragraphs = makeParagraphs(document)
    if (paragraphs.length > 0) {
      chapters.push({ title: chapterTitle, paragraphs })
    }
  }

  if (chapters.length === 0) {
    throw new Error('No readable chapters were found in this EPUB.')
  }

  const coverIndex = chapters.length % coverColors.length
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return {
    id,
    title: bookTitle,
    author,
    color: coverColors[coverIndex],
    mark: coverMarks[coverIndex],
    progress: 0,
    subtitle: 'Imported EPUB',
    isEpub: true,
    file,
    chapters,
    lastReadAt: undefined,
  }
}
