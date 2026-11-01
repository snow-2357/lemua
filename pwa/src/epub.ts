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

function makeParagraphs(document: Document): string[] {
  document.querySelectorAll('script, style, noscript, svg').forEach((element) => {
    element.remove()
  })

  const paragraphs = Array.from(document.querySelectorAll('p'))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)

  if (paragraphs.length > 0) return paragraphs

  const blocks = Array.from(document.querySelectorAll('blockquote, li'))
    .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
  if (blocks.length > 0) return blocks

  const text = document.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  return text ? [text] : []
}

function getMetadataValue(document: Document, name: string): string | undefined {
  return localNameElements(document, name)
    .map((element) => element.textContent?.trim())
    .find((value): value is string => Boolean(value))
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
      item.getAttribute('href') ?? '',
    ]),
  )
  const packageDirectory = normalizedPackagePath.slice(
    0,
    normalizedPackagePath.lastIndexOf('/') + 1,
  )
  const chapters: EpubChapter[] = []

  for (const itemRef of localNameElements(packageDocument, 'itemref')) {
    const href = manifest.get(itemRef.getAttribute('idref') ?? '')
    if (!href) continue

    const chapterPath = resolveArchivePath(packageDirectory, href)
    const chapterFile = archive[chapterPath]
    if (!chapterFile) continue

    const document = new DOMParser().parseFromString(
      strFromU8(chapterFile),
      'text/html',
    )
    const title = document.querySelector('h1, h2, h3')?.textContent?.trim()
    const paragraphs = makeParagraphs(document)
    if (paragraphs.length > 0) {
      chapters.push({ title: title || `Chapter ${chapters.length + 1}`, paragraphs })
    }
  }

  if (chapters.length === 0) {
    throw new Error('No readable chapters were found in this EPUB.')
  }

  const title =
    getMetadataValue(packageDocument, 'title') ||
    file.name.replace(/\.epub$/i, '')
  const author = getMetadataValue(packageDocument, 'creator') || 'Unknown author'
  const coverIndex = chapters.length % coverColors.length
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  return {
    id,
    title,
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
