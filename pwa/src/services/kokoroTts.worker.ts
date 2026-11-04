import { getOrGenerateNarrationChunk } from './kokoroTtsRuntime'

type GenerateRequest = {
  id: number
  type: 'generate'
  key: string
  text: string
  speed: number
}

let generationQueue = Promise.resolve()

self.addEventListener('message', (event: MessageEvent<GenerateRequest>) => {
  const request = event.data
  if (request.type !== 'generate') return

  generationQueue = generationQueue.then(async () => {
    try {
      const audio = await getOrGenerateNarrationChunk(
        request.key,
        request.text,
        request.speed,
        (message) => self.postMessage({ id: request.id, type: 'progress', message }),
      )
      self.postMessage({ id: request.id, type: 'result', audio })
    } catch (error) {
      self.postMessage({
        id: request.id,
        type: 'error',
        message: error instanceof Error ? error.message : 'Could not generate narration audio.',
      })
    }
  })
})
