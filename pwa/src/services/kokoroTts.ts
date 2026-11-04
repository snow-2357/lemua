const narrationDatabaseName = 'lemua-kokoro-narration-v3'
const audioStoreName = 'audio-chunks'
const sequenceStoreName = 'audio-sequences'

type NarrationSequence = {
  key: string
  bookId: string
  chapterIndex: number
  speed: number
  chunkKeys: string[]
}

type WorkerRequest = {
  id: number
  type: 'generate'
  key: string
  text: string
  speed: number
}

type WorkerResponse =
  | { id: number; type: 'progress'; message: string }
  | { id: number; type: 'result'; audio: Blob }
  | { id: number; type: 'error'; message: string }

type PendingRequest = {
  resolve: (audio: Blob) => void
  reject: (error: Error) => void
  onProgress: (message: string) => void
}

let narrationDatabasePromise: Promise<IDBDatabase> | undefined
let generationWorker: Worker | undefined
let nextRequestId = 0
const pendingRequests = new Map<number, PendingRequest>()
const chunkRequests = new Map<string, Promise<Blob>>()

function openNarrationDatabase(): Promise<IDBDatabase> {
  if (!narrationDatabasePromise) {
    narrationDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(narrationDatabaseName, 1)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(audioStoreName)) {
          database.createObjectStore(audioStoreName, { keyPath: 'key' })
        }
        if (!database.objectStoreNames.contains(sequenceStoreName)) {
          database.createObjectStore(sequenceStoreName, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          narrationDatabasePromise = undefined
        }
        resolve(database)
      }
      request.onerror = () => {
        narrationDatabasePromise = undefined
        reject(request.error ?? new Error('Could not open narration storage.'))
      }
      request.onblocked = () => {
        narrationDatabasePromise = undefined
        reject(new Error('Narration storage is blocked by another tab.'))
      }
    })
  }
  return narrationDatabasePromise
}

function saveNarrationSequence(sequence: NarrationSequence): Promise<void> {
  return openNarrationDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(sequenceStoreName, 'readwrite')
        transaction.objectStore(sequenceStoreName).put(sequence)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('Could not save narration order.'))
        }
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('Saving narration order was aborted.'))
        }
      }),
  )
}

function hashText(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, '0')
}

export async function prepareNarrationSequence(
  bookId: string,
  chapterIndex: number,
  chunks: string[],
  speed: number,
): Promise<{ chunkKeys: string[] }> {
  const sequenceSignature = hashText(chunks.join('\u001e'))
  const key = [
    encodeURIComponent(bookId),
    chapterIndex,
    'tone_warm',
    speed,
    sequenceSignature,
  ].join(':')
  const chunkKeys = chunks.map((text, index) => `${key}:${index}:${hashText(text)}`)
  await saveNarrationSequence({ key, bookId, chapterIndex, speed, chunkKeys })
  return { chunkKeys }
}

function getWorker(): Worker {
  if (!generationWorker) {
    const worker = new Worker(new URL('./kokoroTts.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data
      const pending = pendingRequests.get(response.id)
      if (!pending) return

      if (response.type === 'progress') {
        pending.onProgress(response.message)
      } else {
        pendingRequests.delete(response.id)
        if (response.type === 'result') pending.resolve(response.audio)
        else pending.reject(new Error(response.message))
      }
    }
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Kokoro narration worker failed.')
      pendingRequests.forEach(({ reject }) => reject(error))
      pendingRequests.clear()
      worker.terminate()
      if (generationWorker === worker) generationWorker = undefined
    }
    generationWorker = worker
  }
  return generationWorker
}

function requestChunk(
  key: string,
  text: string,
  speed: number,
  onProgress: (message: string) => void,
): Promise<Blob> {
  const existing = chunkRequests.get(key)
  if (existing) return existing

  const id = ++nextRequestId
  const worker = getWorker()
  const request = new Promise<Blob>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, onProgress })
    worker.postMessage({ id, type: 'generate', key, text, speed } satisfies WorkerRequest)
  })
  chunkRequests.set(key, request)
  void request.finally(() => chunkRequests.delete(key)).catch(() => {})
  return request
}

export function getOrGenerateNarrationChunk(
  key: string,
  text: string,
  speed: number,
  onProgress: (message: string) => void,
): Promise<Blob> {
  return requestChunk(key, text, speed, onProgress)
}
