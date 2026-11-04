import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ReaderScreen from '../src/screens/ReaderScreen'
import { installFixtureWorker } from './narration.fixtures'
import '../src/index.css'
import '../src/App.css'

installFixtureWorker()
const book = {
  id: `narration-highlight-${crypto.randomUUID()}`,
  title: 'Passage highlighting fixture',
  author: 'Test Author',
  color: '#849887',
  mark: '*',
  progress: 0,
  subtitle: 'Generated test text',
}
const chapterParagraphs = [0, 1].map((chapter) =>
  Array.from({ length: 10 }, (_, index) =>
    `Section ${chapter + 1}, paragraph ${index + 1}. The river moves quietly past the trees. ` +
    'We can read at our own pace while the narration continues. The spoken passage stays highlighted.'),
)

export default function Fixture() {
  const [chapter, setChapter] = useState(0)
  const [page, setPage] = useState(0)
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [open, setOpen] = useState(true)
  return (
    <div className="app-shell">
      {open ? (
        <ReaderScreen
          book={book}
          chapterTitles={['Highlight test chapter 1', 'Highlight test chapter 2']}
          chapterParagraphs={chapterParagraphs[chapter]}
          chapterIndex={chapter}
          chapterPageCounts={counts}
          readerPage={page}
          onPageCountChange={(count) => setCounts((current) =>
            current[chapter] === count ? current : { ...current, [chapter]: count })}
          progress={0}
          onBack={() => setOpen(false)}
          onChangeChapter={(index, nextPage = 0) => { setChapter(index); setPage(nextPage) }}
          onChangePage={setPage}
        />
      ) : <button onClick={() => setOpen(true)}>Reopen reader</button>}
    </div>
  )
}

const root = document.querySelector('#root')
if (root) createRoot(root).render(<Fixture />)
