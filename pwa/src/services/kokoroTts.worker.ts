import './readableStreamPolyfill'
import { getOrGenerateNarrationChunk, preloadKokoroAssets } from './kokoroTtsRuntime'
import type { NarrationWorkerRequest } from './narrationWorkerTypes'

type WorkRequest = Extract<NarrationWorkerRequest, { type: 'generate' | 'preload' }>

let queue: WorkRequest[] = []
let active: { id: number; abort: AbortController } | undefined

self.addEventListener('message', (event: MessageEvent<NarrationWorkerRequest>) => {
  const request = event.data
  if (request.type === 'cancel') {
    queue = queue.filter(({ id }) => id !== request.id)
    if (active?.id === request.id) active.abort.abort()
    return
  }
  queue.push(request)
  void drainQueue()
})

async function drainQueue() {
  if (active) return
  while (queue.length > 0) {
    const request = queue.shift()
    if (!request) break
    const abort = new AbortController()
    active = { id: request.id, abort }
    try {
      const onProgress = (message: string) =>
        self.postMessage({ id: request.id, type: 'progress', message })
      if (request.type === 'preload') {
        await preloadKokoroAssets(onProgress)
        if (!abort.signal.aborted) self.postMessage({ id: request.id, type: 'ready' })
      } else {
        const audio = await getOrGenerateNarrationChunk(
          request.key,
          request.text,
          request.speed,
          onProgress,
          abort.signal,
        )
        if (!abort.signal.aborted) self.postMessage({ id: request.id, type: 'result', audio })
      }
    } catch (error) {
      if (!abort.signal.aborted) self.postMessage({
        id: request.id,
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not generate narration audio.',
      })
    } finally {
      // Let cancellations and new requests arrive between inference jobs.
      await new Promise((resolve) => setTimeout(resolve, 0))
      active = undefined
    }
  }
}
