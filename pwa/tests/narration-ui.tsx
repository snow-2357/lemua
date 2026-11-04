import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ReaderBottom from '../src/components/ReaderBottom'
import type { NarrationWorkerRequest } from '../src/services/narrationWorkerTypes'
import { fixtureWorkerStats, silentWav } from './narration.fixtures'
import '../src/App.css'

// Only this fixture substitutes inference; production uses the real worker.
class FixtureWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  private timers = new Map<number, ReturnType<typeof setTimeout>>()
  postMessage(request: NarrationWorkerRequest) {
    if (request.type === 'cancel') {
      fixtureWorkerStats.cancelled += 1
      clearTimeout(this.timers.get(request.id))
      this.timers.delete(request.id)
      return
    }
    fixtureWorkerStats.started += 1
    this.onmessage?.(new MessageEvent('message', {
      data: { id: request.id, type: 'progress', message: 'Test model is generating audio in the background...' },
    }))
    this.timers.set(request.id, setTimeout(() => {
      this.timers.delete(request.id)
      fixtureWorkerStats.completed += 1
      this.onmessage?.(new MessageEvent('message', {
        data: { id: request.id, type: 'result', audio: silentWav(4) },
      }))
    }, 1500))
  }
  terminate() {
    this.timers.forEach(clearTimeout)
    this.timers.clear()
  }
}
Object.defineProperty(globalThis, 'Worker', { configurable: true, value: FixtureWorker })

const fixtureId = `narration-ui-${crypto.randomUUID()}`
const chunks = Array.from({ length: 8 }, (_, index) => ({
  text: `Fixture ${fixtureId}, passage ${index + 1}. This is a natural multi-sentence passage for testing.`,
  pageIndex: index,
}))

export default function Fixture() {
  const [chapter, setChapter] = useState(0)
  const [page, setPage] = useState(0)
  return (
    <main className="reader-page">
      <header className="reader-header">
        <h1>Narration UI fixture</h1>
        <button onClick={() => { setChapter(chapter + 1); setPage(0) }}>Change chapter</button>
      </header>
      <section className="reading-area">
        <p>Manual reading page {page + 1}, chapter {chapter + 1}. This text stays usable during generation.</p>
      </section>
      <ReaderBottom
        key={chapter}
        bookId={fixtureId}
        chapterIndex={chapter}
        chapterTitle={`Test chapter ${chapter + 1}`}
        readerPage={page}
        pageCount={8}
        chunks={chunks}
        progress={0}
        onChangePage={setPage}
        onPreviousPage={() => setPage(Math.max(0, page - 1))}
        onNextPage={() => setPage(Math.min(7, page + 1))}
      />
    </main>
  )
}

const root = document.querySelector('#root')
if (root) createRoot(root).render(<Fixture />)
