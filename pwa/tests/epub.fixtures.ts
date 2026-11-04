import { strToU8, zipSync } from 'fflate'

type FixtureOptions = {
  documents: { path: string; html: string }[]
  navigation?: string
  ncx?: boolean
  extraNavigation?: string
}

export function makeEpub({
  documents,
  navigation,
  ncx = false,
  extraNavigation,
}: FixtureOptions): File {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    ),
  }
  const manifest = documents.map(({ path }, index) =>
    `<item id="s${index}" href="${path}" media-type="application/xhtml+xml"/>`,
  )
  if (navigation !== undefined) {
    const path = ncx ? 'toc.ncx' : 'nav.xhtml'
    files[`OPS/${path}`] = strToU8(navigation)
    manifest.push(ncx
      ? '<item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
      : '<item id="toc" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
  }
  if (extraNavigation) {
    files['OPS/legacy.ncx'] = strToU8(extraNavigation)
    manifest.unshift('<item id="legacy" href="legacy.ncx" media-type="application/x-dtbncx+xml"/>')
  }
  files['OPS/book.opf'] = strToU8(
    `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="${ncx ? '2.0' : '3.0'}">
    <metadata><dc:title>Fixture Book</dc:title><dc:creator>Test Author</dc:creator></metadata>
    <manifest>${manifest.join('')}</manifest>
    <spine>${documents.map((_, index) => `<itemref idref="s${index}"/>`).join('')}</spine>
    </package>`,
  )
  for (const { path, html } of documents) {
    files[`OPS/${decodeURIComponent(path)}`] = strToU8(
      `<html><head><title>Fixture Book</title></head><body>${html}</body></html>`,
    )
  }
  const archive = zipSync(files)
  return new File([new Uint8Array(archive)], 'fixture.epub', { type: 'application/epub+zip' })
}

export function makeSharedChapterBook(ncx = false): File {
  const starts = [1, 8, 20, 35, 46, 56, 73, 87, 100, 115, 134, 136]
  const links: string[] = []
  const documents = starts.slice(0, -1).map((start, index) => {
    const path = `part${index}.xhtml`
    const sections: string[] = []
    for (let chapter = start; chapter < starts[index + 1]; chapter += 1) {
      const title = chapter === 1 ? 'CHAPTER 1. Loomings.' : `CHAPTER ${chapter}. Fixture ${chapter}.`
      const href = `${path}#chapter${chapter}`
      links.push(ncx
        ? `<navPoint id="n${chapter}"><navLabel><text>${title}</text></navLabel><content src="${href}"/></navPoint>`
        : `<li><a href="${href}">${title}</a></li>`)
      sections.push(`<section id="chapter${chapter}"><h2>${title}</h2>
        <p>Opening paragraph for chapter ${chapter}.</p>
        <p>Repeated refrain.</p><p>Closing paragraph for chapter ${chapter}.</p></section>`)
    }
    return { path, html: sections.join('') }
  })
  return makeEpub({
    documents,
    ncx,
    navigation: ncx
      ? `<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>${links.join('')}</navMap></ncx>`
      : `<html><body><nav epub:type="toc"><ol>${links.join('')}</ol></nav></body></html>`,
  })
}
