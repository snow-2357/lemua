import type { NarrationOutput } from '../src/services/narrationPlayer'

export const fixtureWorkerStats = { started: 0, cancelled: 0, completed: 0 }

export function silentWav(seconds = 2): Blob {
  const sampleRate = 8000
  const bytes = new ArrayBuffer(44 + Math.ceil(seconds * sampleRate) * 2)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) => {
    Array.from(value).forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  }
  text(0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, bytes.byteLength - 44, true)
  return new Blob([bytes], { type: 'audio/wav' })
}

export class FakeOutput implements NarrationOutput {
  currentTime = 0
  resumes = 0
  suspends = 0
  closed = false
  sources: { start: number; end: number; ended: () => void; stopped: boolean; finished: boolean }[] = []

  async resume() { this.resumes += 1 }
  async suspend() { this.suspends += 1 }
  async close() { this.closed = true }
  async decode() { return new AudioBuffer({ length: 16000, sampleRate: 8000 }) }
  schedule(audio: AudioBuffer, start: number, ended: () => void) {
    const source = { start, end: start + audio.duration, ended, stopped: false, finished: false }
    this.sources.push(source)
    return () => { source.stopped = true }
  }
  advanceTo(time: number) {
    this.currentTime = time
    for (const source of this.sources) {
      if (!source.finished && !source.stopped && source.end <= time) {
        source.finished = true
        source.ended()
      }
    }
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

export async function until(predicate: () => boolean) {
  const deadline = performance.now() + 2000
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error('Timed out waiting for narration state')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
