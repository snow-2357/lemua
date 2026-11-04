import { createNarrationChunks, findNarrationStart } from '../src/utils/narrationText'
import { initialNarrationSnapshot, NarrationPlayer } from '../src/services/narrationPlayer'
import { getOrGenerateNarrationChunk, prepareNarrationSequence } from '../src/services/kokoroTts'
import { deferred, FakeOutput, silentWav, until } from './narration.fixtures'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function equal(actual: unknown, expected: unknown) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function normalize(text: string) { return text.replace(/\s+/g, ' ').trim() }

const tests: [string, () => Promise<void>][] = [
  ['Groups short sentences naturally, bounds work, and preserves every word', async () => {
    const paragraphs = [
      Array.from({ length: 45 }, (_, index) => `Sentence ${index + 1} is part of the story.`).join(' '),
      'A second paragraph. It keeps all its punctuation! Does it really? Yes.',
      'A very long sentence ' + 'with words '.repeat(130) + 'and an ending.',
      'x'.repeat(650),
    ]
    const chunks = createNarrationChunks(paragraphs, [])
    equal(normalize(chunks.map(({ text }) => text).join(' ')).replace(/ /g, ''),
      normalize(paragraphs.join(' ')).replace(/ /g, ''))
    assert(chunks[0].text.length <= 240, 'Opening passage should be quick to generate')
    assert(chunks.slice(1).every(({ text }) => text.length <= 480), 'Passages exceed inference budget')
    assert(chunks[0].text.includes('Sentence 2'), 'Still generating one-line clips')
    assert(chunks.slice(1, 3).every(({ text }) => text.length >= 300), 'Subsequent passages should be fuller')
  }],
  ['Narration text/cache boundaries remain stable when pagination changes', async () => {
    const text = 'A sentence with several words. '.repeat(40).trim()
    const unpaginated = createNarrationChunks([text], [])
    const first = text.slice(0, text.indexOf(' ', 350))
    const second = text.slice(first.length).trim()
    const paginated = createNarrationChunks([text], [
      [{ text: first, continues: false, complete: false }],
      [{ text: second, continues: true, complete: true }],
    ])
    equal(unpaginated.map(({ text }) => text), paginated.map(({ text }) => text))
    assert(paginated.some(({ pageIndex }) => pageIndex === 1), 'Long paragraphs must map to later pages')
    equal(findNarrationStart(paginated, 1), paginated.findIndex(({ pageIndex }) => pageIndex === 1))
    equal(findNarrationStart([{ text: 'Spans pages', pageIndex: 0 }, { text: 'Later', pageIndex: 3 }], 2), 0)
  }],
  ['Continuous scheduling, one producer, and at most four decoded passages ahead', async () => {
    const output = new FakeOutput()
    let active = 0
    let maxActive = 0
    let calls = 0
    const states: string[] = []
    const player = new NarrationPlayer(Array.from({ length: 20 }, (_, index) => `Passage ${index}`), {
      createOutput: () => output,
      prepare: async (texts) => ({ chunkKeys: texts }),
      generate: async () => {
        calls += 1
        active += 1
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active -= 1
        return silentWav()
      },
    }, ({ state }) => states.push(state), () => {})
    try {
      await player.start(0)
      await until(() => output.sources.length === 4)
      equal(calls, 4)
      equal(maxActive, 1)
      output.sources.slice(1).forEach((source, index) => equal(source.start, output.sources[index].end))
      output.advanceTo(2.1)
      await until(() => output.sources.length === 5)
      equal(output.sources[4].start, output.sources[3].end)
      assert(states.includes('playing'), 'Playback did not begin')
    } finally { player.stop() }
  }],
  ['Pause during generation stays paused when audio arrives; resume preserves it', async () => {
    const output = new FakeOutput()
    const pending = deferred<Blob>()
    let snapshot = initialNarrationSnapshot
    const player = new NarrationPlayer(['First passage', 'Second passage'], {
      createOutput: () => output,
      prepare: async (texts) => ({ chunkKeys: texts }),
      generate: () => pending.promise,
    }, (next) => { snapshot = next }, () => {})
    try {
      await player.start(0)
      player.pause()
      equal(snapshot.state, 'paused')
      pending.resolve(silentWav())
      await until(() => output.sources.length === 1)
      equal(snapshot.state, 'paused')
      equal(output.resumes, 1)
      await player.resume()
      equal(output.resumes, 2)
      await until(() => output.sources.length === 2)
    } finally { player.stop() }
  }],
  ['Stop aborts pending generation and cannot resurrect playback or update the UI', async () => {
    const output = new FakeOutput()
    const pending = deferred<Blob>()
    let signal: AbortSignal | undefined
    let updates = 0
    const player = new NarrationPlayer(['First passage'], {
      createOutput: () => output,
      prepare: async (texts) => ({ chunkKeys: texts }),
      generate: (_key, _text, nextSignal) => { signal = nextSignal; return pending.promise },
    }, () => { updates += 1 }, () => {})
    await player.start(0)
    player.stop()
    const stoppedUpdates = updates
    assert(signal?.aborted, 'Stop did not cancel the request')
    pending.resolve(silentWav())
    await new Promise((resolve) => setTimeout(resolve, 30))
    equal(output.sources.length, 0)
    equal(updates, stoppedUpdates)
    assert(output.closed, 'Audio output was not released')
  }],
  ['Buffer underrun reports waiting, then recovers in order without replaying text', async () => {
    const output = new FakeOutput()
    const second = deferred<Blob>()
    let snapshot = initialNarrationSnapshot
    let calls = 0
    const player = new NarrationPlayer(['First passage', 'Second passage'], {
      createOutput: () => output,
      prepare: async (texts) => ({ chunkKeys: texts }),
      generate: () => ++calls === 1 ? Promise.resolve(silentWav()) : second.promise,
    }, (next) => { snapshot = next }, () => {})
    try {
      await player.start(0)
      await until(() => calls === 2)
      output.advanceTo(3)
      equal(snapshot.state, 'buffering')
      second.resolve(silentWav())
      await until(() => output.sources.length === 2)
      assert(output.sources[1].start > 3, 'Recovery scheduled audio in the past')
      output.advanceTo(output.sources[1].end + 0.01)
      equal(snapshot.state, 'finished')
      equal(snapshot.currentTime, 4)
      equal(calls, 2)
    } finally { player.stop() }
  }],
  ['A generation failure is visible and releases playback resources', async () => {
    const output = new FakeOutput()
    let snapshot = initialNarrationSnapshot
    const player = new NarrationPlayer(['A passage'], {
      createOutput: () => output,
      prepare: async (texts) => ({ chunkKeys: texts }),
      generate: async () => { throw new Error('Test inference failure') },
    }, (next) => { snapshot = next }, () => {})
    await player.start(0)
    await until(() => snapshot.state === 'error')
    equal(snapshot.error, 'Test inference failure')
    assert(output.closed, 'Failed output stayed open')
  }],
  ['Passage changes follow playback time, not the background generation cursor', async () => {
    const output = new FakeOutput()
    const followed: number[] = []
    const player = new NarrationPlayer(['One', 'Two', 'Three'], {
      createOutput: () => output,
      prepare: async (texts) => ({ chunkKeys: texts }),
      generate: async () => silentWav(),
    }, () => {}, (index) => followed.push(index))
    try {
      await player.start(0)
      await until(() => output.sources.length === 3)
      equal(followed, [])
      output.advanceTo(2.1)
      equal(followed, [1])
      output.advanceTo(4.1)
      equal(followed, [1, 2])
    } finally { player.stop() }
  }],
  ['Audio keys reuse identical text across chapters; cached playback never starts a worker', async () => {
    const bookId = `narration-regression-${crypto.randomUUID()}`
    const text = `Unique cache regression ${bookId}.`
    const first = await prepareNarrationSequence(bookId, 0, [text, 'Other text'], 1)
    const second = await prepareNarrationSequence(bookId, 5, ['Other text', text], 1)
    const faster = await prepareNarrationSequence(bookId, 0, [text], 1.2)
    equal(first.chunkKeys[0], second.chunkKeys[1])
    assert(first.chunkKeys[0] !== faster.chunkKeys[0], 'Speed must affect cached audio')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lemua-kokoro-narration-v3', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const nativeWorker = globalThis.Worker
    let workerStarted = false
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('audio-chunks', 'readwrite')
        transaction.objectStore('audio-chunks').put({ key: first.chunkKeys[0], audio: silentWav() })
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class {
        constructor() { workerStarted = true; throw new Error('Cached audio must bypass the worker') }
      } })
      const audio = await getOrGenerateNarrationChunk(first.chunkKeys[0], text, 1, () => {}, new AbortController().signal)
      assert(audio.size > 44, 'Missing cached WAV')
      equal(workerStarted, false)
      const abort = new AbortController()
      abort.abort()
      let cancelled = false
      try { await getOrGenerateNarrationChunk(first.chunkKeys[0], text, 1, () => {}, abort.signal) }
      catch (error) { cancelled = error instanceof DOMException && error.name === 'AbortError' }
      assert(cancelled, 'Aborted playback still read the cache')
    } finally {
      Object.defineProperty(globalThis, 'Worker', { configurable: true, value: nativeWorker })
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['audio-chunks', 'audio-sequences'], 'readwrite')
        transaction.objectStore('audio-chunks').delete(first.chunkKeys[0])
        const request = transaction.objectStore('audio-sequences').openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) return
          if (cursor.value.bookId === bookId) cursor.delete()
          cursor.continue()
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
      })
      database.close()
    }
  }],
]

let failures = 0
for (const [name, run] of tests) {
  const result = document.createElement('li')
  try { await run(); result.textContent = `PASS: ${name}` }
  catch (error) {
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
