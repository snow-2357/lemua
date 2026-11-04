import { epubParserVersion, parseEpub } from '../src/epub'
import {
  deleteImportedBook,
  loadImportedBooks,
  persistImportedBook,
  upgradeImportedBook,
} from '../src/settings'
import { makeEpub, makeSharedChapterBook } from './epub.fixtures'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function equal(actual: unknown, expected: unknown) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

async function rejects(action: () => Promise<unknown>, message: string) {
  try {
    await action()
  } catch (error) {
    assert(error instanceof Error && error.message.includes(message), String(error))
    return
  }
  throw new Error(`Expected failure containing "${message}"`)
}

const tests: [string, () => Promise<void>][] = []
for (const ncx of [false, true]) {
  tests.push([`${ncx ? 'EPUB 2 NCX' : 'EPUB 3 nav'}: exactly 135 chapters across shared files`, async () => {
    const book = await parseEpub(makeSharedChapterBook(ncx))
    equal(book.chapters.length, 135)
    equal(book.chapters[0].title, 'CHAPTER 1. Loomings.')
    book.chapters.forEach((chapter, index) => {
      const number = index + 1
      assert(chapter.title.startsWith(`CHAPTER ${number}.`), `Wrong title at chapter ${number}`)
      equal(chapter.paragraphs, [
        `Opening paragraph for chapter ${number}.`,
        'Repeated refrain.',
        `Closing paragraph for chapter ${number}.`,
      ])
    })
    equal(book.epubParserVersion, epubParserVersion)
  }])
}

tests.push(
  ['Uses spine and document order, not manifest or TOC link order', async () => {
    const book = await parseEpub(makeEpub({
      documents: [
        { path: 'z.xhtml', html: '<h2 id="one">One</h2><p>First.</p><h2 id="two">Two</h2><p>Second.</p>' },
        { path: 'a.xhtml', html: '<h2 id="three">Three</h2><p>Third.</p>' },
      ],
      navigation: '<nav><a href="a.xhtml#three">Three</a><a href="z.xhtml#two">Two</a><a href="z.xhtml#one">One</a></nav>',
    }))
    equal(book.chapters.map(({ title }) => title), ['One', 'Two', 'Three'])
    equal(book.chapters.map(({ paragraphs }) => paragraphs), [['First.'], ['Second.'], ['Third.']])
  }],
  ['Decodes paths/fragments and supports legacy named anchors', async () => {
    const book = await parseEpub(makeEpub({
      documents: [{
        path: 'Text/part%20one.xhtml',
        html: '<h2 id="c:1">One</h2><p>First.</p><a name="old-two"></a><h2>Two</h2><p>Second.</p>',
      }],
      navigation: '<nav><a href="Text/part%20one.xhtml#c%3A1">One</a><a href="Text/part%20one.xhtml#old-two">Two</a></nav>',
    }))
    equal(book.chapters.map(({ paragraphs }) => paragraphs), [['First.'], ['Second.']])
  }],
  ['Nested part/chapter entries and duplicate links do not duplicate content', async () => {
    const book = await parseEpub(makeEpub({
      documents: [{
        path: 'text.xhtml',
        html: '<section id="part"><h1>Part 1</h1><section id="one"><h2>One</h2><p>First.</p></section><section id="two"><h2>Two</h2><p>Second.</p></section></section>',
      }],
      navigation: '<nav><a href="text.xhtml">Book</a><a href="text.xhtml#part">Part 1</a><a href="text.xhtml#one">One</a><a href="text.xhtml#one">Duplicate</a><a href="text.xhtml#two">Two</a></nav>',
    }))
    equal(book.chapters.map(({ title }) => title), ['One', 'Two'])
    equal(book.chapters.map(({ paragraphs }) => paragraphs), [['First.'], ['Second.']])
  }],
  ['Preserves pre-anchor prose, short chapters and files omitted from the TOC', async () => {
    const book = await parseEpub(makeEpub({
      documents: [
        { path: 'one.xhtml', html: '<p>Prologue.</p><h2 id="one">One</h2><p>Very short.</p>' },
        { path: 'omitted.xhtml', html: '<p>Unlisted story.</p>' },
      ],
      navigation: '<nav><a href="one.xhtml#one">One</a></nav>',
    }))
    equal(book.chapters.map(({ paragraphs }) => paragraphs),
      [['Prologue.'], ['Very short.'], ['Unlisted story.']])
  }],
  ['No TOC: splits repeated headings and retains an untitled short opening', async () => {
    const book = await parseEpub(makeEpub({
      documents: [
        { path: 'opening.xhtml', html: '<p>Opening story.</p>' },
        { path: 'chapters.xhtml', html: '<h2>One</h2><p>First.</p><h2>Two</h2><p>Second.</p>' },
      ],
    }))
    equal(book.chapters.map(({ paragraphs }) => paragraphs), [['Opening story.'], ['First.'], ['Second.']])
  }],
  ['A nested contents nav does not discard story in the same file', async () => {
    const book = await parseEpub(makeEpub({
      documents: [{
        path: 'text.xhtml',
        html: '<nav epub:type="toc"><p>Contents</p><a href="#one">One</a></nav><h2 id="one">One</h2><p>Story.</p>',
      }],
      navigation: '<nav><a href="text.xhtml#one">One</a></nav>',
    }))
    equal(book.chapters.map(({ paragraphs }) => paragraphs), [['Story.']])
  }],
  ['EPUB 3 nav takes precedence over a stale legacy NCX', async () => {
    const book = await parseEpub(makeEpub({
      documents: [{ path: 'one.xhtml', html: '<h2 id="one">One</h2><p>Story.</p>' }],
      navigation: '<nav><a href="one.xhtml#one">Correct title</a></nav>',
      extraNavigation: '<ncx><navMap><navPoint><navLabel><text>Wrong title</text></navLabel><content src="one.xhtml"/></navPoint></navMap></ncx>',
    }))
    equal(book.chapters.map(({ title }) => title), ['Correct title'])
  }],
  ['Missing chapter anchors fail explicitly rather than import the wrong text', async () => {
    await rejects(() => parseEpub(makeEpub({
      documents: [{ path: 'one.xhtml', html: '<p>Story.</p>' }],
      navigation: '<nav><a href="one.xhtml#missing">Missing</a></nav>',
    })), 'missing chapter')
  }],
  ['Standalone contents pages are not exposed as reading chapters', async () => {
    const book = await parseEpub(makeEpub({
      documents: [
        { path: 'toc.xhtml', html: '<h1>Contents</h1><p><a href="one.xhtml">One</a></p>' },
        { path: 'one.xhtml', html: '<h1>One</h1><p>Story.</p>' },
      ],
    }))
    equal(book.chapters.map(({ paragraphs }) => paragraphs), [['Story.']])
  }],
  ['Saved legacy imports rebuild and persist all 135 chapters without changing identity', async () => {
    const parsed = await parseEpub(makeSharedChapterBook())
    const legacy = {
      ...parsed,
      id: `epub-regression-${crypto.randomUUID()}`,
      epubParserVersion: undefined,
      chapters: [{ title: 'Wrong file title', paragraphs: [
        ...parsed.chapters[2].paragraphs, ...parsed.chapters[3].paragraphs,
      ] }],
      fileFingerprint: `regression-${crypto.randomUUID()}`,
      lastChapterIndex: 0,
      lastReaderPage: 25,
      lastReadAt: 123,
    }
    await persistImportedBook(legacy)
    try {
      const upgraded = await upgradeImportedBook(legacy)
      equal(upgraded.chapters.length, 135)
      equal(upgraded.id, legacy.id)
      equal(upgraded.fileFingerprint, legacy.fileFingerprint)
      equal(upgraded.lastReadAt, legacy.lastReadAt)
      equal(upgraded.lastChapterIndex, 2)
      equal(upgraded.lastReaderPage, 0)
      equal(upgraded.file.size, legacy.file.size)
      const saved = (await loadImportedBooks()).find(({ id }) => id === legacy.id)
      equal(saved?.chapters, upgraded.chapters)
      equal(saved?.epubParserVersion, epubParserVersion)
      assert(await upgradeImportedBook(upgraded) === upgraded, 'Current imports should not be rebuilt')
    } finally {
      await deleteImportedBook(legacy.id)
    }
  }],
  ['A failed rebuild leaves the saved book and reading position unchanged', async () => {
    const parsed = await parseEpub(makeSharedChapterBook())
    const legacy = {
      ...parsed,
      id: `epub-regression-${crypto.randomUUID()}`,
      epubParserVersion: undefined,
      file: new Blob(['not an EPUB']),
      lastChapterIndex: 5,
      lastReaderPage: 3,
    }
    await persistImportedBook(legacy)
    try {
      await rejects(() => upgradeImportedBook(legacy), 'not a valid or readable EPUB archive')
      const saved = (await loadImportedBooks()).find(({ id }) => id === legacy.id)
      equal(saved?.chapters, legacy.chapters)
      equal(saved?.lastChapterIndex, 5)
      equal(saved?.lastReaderPage, 3)
      equal(saved?.epubParserVersion, undefined)
    } finally {
      await deleteImportedBook(legacy.id)
    }
  }],
)

let failures = 0
for (const [name, run] of tests) {
  const result = document.createElement('li')
  try {
    await run()
    result.textContent = `PASS: ${name}`
  } catch (error) {
    failures += 1
    result.textContent = `FAIL: ${name}: ${String(error)}`
    console.error(name, error)
  }
  document.querySelector('#results')?.append(result)
}
const summary = document.querySelector('#summary')
if (summary) {
  summary.textContent = `${tests.length - failures}/${tests.length} passed; ${failures} failed`
  summary.setAttribute('data-status', failures === 0 ? 'passed' : 'failed')
}
