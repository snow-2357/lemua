import * as ort from 'onnxruntime-web/wasm'
import { phonemize } from 'phonemizer'

// One ONNX file: phoneme tokens in, 22050 Hz audio out (student + vocoder).
// Upload tts_student_vocoder.onnx (or the _int8 file) to this repo first.
const modelUrl =
  'https://huggingface.co/snow2357/koroko_int8/resolve/main/lumua.onnx'
const sampleRate = 22050
const vocabSize = 10000
const bosToken = 1
const eosToken = 2
// The student was trained on utterances up to about 18 seconds (roughly 250
// phoneme characters), so longer text is split before it reaches the model.
const maxTokensPerRun = 220
const sentencePauseMs = 200
const clausePauseMs = 80
const language = 'en-us'
const assetDatabaseName = 'lemua-kokoro-assets'
const assetStoreName = 'assets'
// Bumped from v3 so narration cached with the old Kokoro voice is never replayed.
const narrationDatabaseName = 'lemua-kokoro-narration-v4'
const audioStoreName = 'audio-chunks'

// What the previous Kokoro version stored on the device (see clearOldKokoroCache).
const oldBundleBaseUrl =
  'https://huggingface.co/snow2357/koroko_int8/resolve/main/mobile_bundle'
const oldAssetUrls = [
  `${oldBundleBaseUrl}/kokoro_mobile_int8.onnx`,
  `${oldBundleBaseUrl}/voices_mobile.bin`,
  `${oldBundleBaseUrl}/kokoro_metadata.json`,
]
const oldNarrationDatabaseName = 'lemua-kokoro-narration-v3'

type CachedAsset = {
  key: string
  buffer: ArrayBuffer
}

type CachedAudioChunk = {
  key: string
  audio: Blob
}

type TtsRuntime = {
  session: ort.InferenceSession
}

let runtimePromise: Promise<TtsRuntime> | undefined
let assetDatabasePromise: Promise<IDBDatabase> | undefined
let narrationDatabasePromise: Promise<IDBDatabase> | undefined

function openAssetDatabase(): Promise<IDBDatabase> {
  if (!assetDatabasePromise) {
    assetDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(assetDatabaseName, 2)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(assetStoreName)) {
          database.createObjectStore(assetStoreName, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          assetDatabasePromise = undefined
        }
        resolve(database)
      }
      request.onerror = () => {
        assetDatabasePromise = undefined
        reject(request.error ?? new Error('Could not open on-device model storage.'))
      }
      request.onblocked = () => {
        assetDatabasePromise = undefined
        reject(new Error('On-device model storage is blocked by another tab.'))
      }
    })
  }
  return assetDatabasePromise
}

function openNarrationDatabase(): Promise<IDBDatabase> {
  if (!narrationDatabasePromise) {
    narrationDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(narrationDatabaseName, 1)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(audioStoreName)) {
          database.createObjectStore(audioStoreName, { keyPath: 'key' })
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

async function readCachedAsset(key: string): Promise<ArrayBuffer | undefined> {
  const database = await openAssetDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(assetStoreName, 'readonly')
    const request = transaction.objectStore(assetStoreName).get(key)
    let result: ArrayBuffer | undefined

    request.onsuccess = () => {
      const record = request.result as CachedAsset | undefined
      if (record && record.buffer instanceof ArrayBuffer) result = record.buffer
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Could not read saved speech files.'))
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not read saved speech files.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Reading saved speech files was aborted.'))
    }
  })
}

async function saveCachedAsset(key: string, buffer: ArrayBuffer): Promise<void> {
  const database = await openAssetDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(assetStoreName, 'readwrite')
    transaction.objectStore(assetStoreName).put({ key, buffer } satisfies CachedAsset)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not save speech files on this device.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Saving speech files was aborted.'))
    }
  }).catch((error: unknown) => {
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'UnknownError')
    ) {
      throw new Error(
        'There is not enough browser storage to save the speech model. Free device storage and try again.',
        { cause: error },
      )
    }
    throw error
  })
}

async function fetchBuffer(
  url: string,
  label: string,
  onProgress: (message: string) => void,
): Promise<ArrayBuffer> {
  const cachedBuffer = await readCachedAsset(url)
  if (cachedBuffer) {
    onProgress(`Using the saved ${label} on this device`)
    return cachedBuffer
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Could not download the ${label} (HTTP ${response.status}).`)
  }
  if (!response.body) {
    onProgress(`Downloading ${label}…`)
    const buffer = await response.arrayBuffer()
    await saveCachedAsset(url, buffer)
    onProgress(`Saved ${label} on this device`)
    return buffer
  }

  const reader = response.body.getReader()
  const total = Number(response.headers.get('content-length')) || 0
  const bytes = total > 0 ? new Uint8Array(total) : undefined
  const chunks: Uint8Array[] = []
  let downloaded = 0
  let lastProgress = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (bytes) {
      if (downloaded + value.length > bytes.length) {
        throw new Error(`The downloaded ${label} is larger than expected.`)
      }
      bytes.set(value, downloaded)
    } else {
      chunks.push(value)
    }
    downloaded += value.length
    const downloadedMb = Math.round(downloaded / (1024 * 1024))
    const totalMb = total ? ` of ${Math.round(total / (1024 * 1024))} MB` : ''
    const progress = `Downloading ${label}: ${downloadedMb} MB${totalMb}`
    if (progress !== lastProgress) onProgress(progress)
    lastProgress = progress
  }

  if (bytes) {
    if (downloaded !== bytes.length) {
      throw new Error(`The downloaded ${label} is incomplete.`)
    }
    await saveCachedAsset(url, bytes.buffer)
    onProgress(`Saved ${label} on this device`)
    return bytes.buffer
  }

  const completeBytes = new Uint8Array(downloaded)
  let offset = 0
  for (const chunk of chunks) {
    completeBytes.set(chunk, offset)
    offset += chunk.length
  }
  await saveCachedAsset(url, completeBytes.buffer)
  onProgress(`Saved ${label} on this device`)
  return completeBytes.buffer
}

export async function preloadKokoroAssets(
  onProgress: (message: string) => void,
): Promise<void> {
  await fetchBuffer(modelUrl, 'speech model', onProgress)
}

// Optional: call once (for example from a settings screen) to free the space used
// by the previous Kokoro model, voice pack and narration audio. Nothing calls it
// automatically.
export async function clearOldKokoroCache(): Promise<void> {
  const database = await openAssetDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(assetStoreName, 'readwrite')
    const store = transaction.objectStore(assetStoreName)
    for (const url of oldAssetUrls) store.delete(url)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not clear the old speech files.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Clearing the old speech files was aborted.'))
    }
  })
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(oldNarrationDatabaseName)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}

function readAudioChunk(key: string): Promise<Blob | undefined> {
  return openNarrationDatabase().then(
    (database) =>
      new Promise<Blob | undefined>((resolve, reject) => {
        const transaction = database.transaction(audioStoreName, 'readonly')
        const request = transaction.objectStore(audioStoreName).get(key)
        let audio: Blob | undefined
        request.onsuccess = () => {
          const record = request.result as CachedAudioChunk | undefined
          if (record?.audio instanceof Blob) audio = record.audio
        }
        request.onerror = () => {
          reject(request.error ?? new Error('Could not read saved narration audio.'))
        }
        transaction.oncomplete = () => resolve(audio)
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('Could not read saved narration audio.'))
        }
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('Reading saved narration was aborted.'))
        }
      }),
  )
}

function writeAudioChunk(key: string, audio: Blob): Promise<void> {
  return openNarrationDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(audioStoreName, 'readwrite')
        transaction.objectStore(audioStoreName).put({ key, audio } satisfies CachedAudioChunk)
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('Could not save this narration chunk.'))
        }
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('Saving this narration chunk was aborted.'))
        }
      }),
  )
}

export async function getOrGenerateNarrationChunk(
  key: string,
  text: string,
  speed: number,
  onProgress: (message: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  signal?.throwIfAborted()
  const cachedAudio = await readAudioChunk(key)
  signal?.throwIfAborted()
  if (cachedAudio) {
    onProgress('Playing a saved narration chunk')
    return cachedAudio
  }
  onProgress('Generating the next narration chunk…')
  const audio = await generateKokoroAudio(text, speed, onProgress, signal)
  signal?.throwIfAborted()
  await writeAudioChunk(key, audio)
  return audio
}

async function loadRuntime(
  onProgress: (message: string) => void,
): Promise<TtsRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      onProgress('Loading the speech model…')
      const modelBuffer = await fetchBuffer(modelUrl, 'speech model', onProgress)

      onProgress('Preparing the speech model on this device…')
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated
        ? Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
        : 1
      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['wasm'],
      })

      const requiredInputs = ['tokens', 'speed']
      if (
        requiredInputs.some((name) => !session.inputNames.includes(name)) ||
        !session.outputNames.includes('waveform')
      ) {
        await session.release()
        throw new Error('The downloaded speech model has an unsupported input format.')
      }

      return { session }
    })().catch((error: unknown) => {
      runtimePromise = undefined
      throw error
    })
  }
  return runtimePromise
}

// ---------------------------------------------------------------- text frontend
// This must match frontend.py exactly: raw eSpeak en-us IPA with stress marks,
// punctuation kept, single spaces between words. Do not add text normalization or
// character replacements; the student was never trained on them.

// The same punctuation marks Python's phonemizer keeps (preserve_punctuation=True).
const punctuationPattern = /((?:\s*[;:,.!?¡¿—…"«»“”]+\s*)+)/

async function textToPhonemes(text: string): Promise<string> {
  const sections = text.trim().split(punctuationPattern) // odd indexes are punctuation
  const parts = await Promise.all(
    sections.map(async (section, index) => {
      if (index % 2 === 1) return section
      if (!section.trim()) return ''
      return (await phonemize(section, language)).join(' ')
    }),
  )
  return parts.join('').trim().split(/\s+/).join(' ')
}

function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(language, { granularity: 'sentence' })
    return Array.from(segmenter.segment(clean), (part) => part.segment.trim()).filter(
      Boolean,
    )
  }
  const matches = clean.match(/[^.!?…]+(?:[.!?…]+["”')\]]*|$)/g)
  return matches ? matches.map((sentence) => sentence.trim()).filter(Boolean) : [clean]
}

// Cuts an over-long phoneme string at a comma, then a space, near the limit.
function splitPhonemes(phonemes: string, limit: number): string[] {
  const pieces: string[] = []
  let rest = phonemes
  while (rest.length > limit) {
    const window = rest.slice(0, limit)
    let cut = Math.max(
      window.lastIndexOf(', '),
      window.lastIndexOf('; '),
      window.lastIndexOf(': '),
    )
    if (cut < limit / 2) cut = window.lastIndexOf(' ')
    if (cut < limit / 3) cut = limit - 1
    pieces.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) pieces.push(rest)
  return pieces.filter(Boolean)
}

// [start] + one id per phoneme character (its code point) + [end].
function toTokenIds(phonemes: string): BigInt64Array {
  const ids: number[] = [bosToken]
  for (const character of phonemes) {
    const id = character.codePointAt(0)!
    if (id > eosToken && id < vocabSize) ids.push(id)
  }
  ids.push(eosToken)
  return BigInt64Array.from(ids, (id) => BigInt(id))
}

// ---------------------------------------------------------------- audio

function encodeWav(samples: Float32Array): Blob {
  const wav = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(wav)
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(
      44 + index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    )
  }
  return new Blob([wav], { type: 'audio/wav' })
}

function createSilence(durationMs: number): Float32Array {
  return new Float32Array(Math.floor((sampleRate * durationMs) / 1000))
}

export async function generateKokoroAudio(
  text: string,
  speed: number,
  onProgress: (message: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const runtime = await loadRuntime(onProgress)
  signal?.throwIfAborted()
  onProgress('Preparing the page text…')

  const sentences = splitSentences(text)
  const audioChunks: Float32Array[] = []
  let generated = false

  for (const [sentenceIndex, sentence] of sentences.entries()) {
    signal?.throwIfAborted()
    const phonemes = await textToPhonemes(sentence)
    signal?.throwIfAborted()
    const pieces = splitPhonemes(phonemes, maxTokensPerRun)

    for (const [pieceIndex, piece] of pieces.entries()) {
      const tokens = toTokenIds(piece)
      if (tokens.length <= 2) continue // nothing speakable in this piece

      await new Promise((resolve) => setTimeout(resolve, 0))
      signal?.throwIfAborted()
      onProgress('Generating speech on this device…')

      const inputs: Record<string, ort.Tensor> = {
        tokens: new ort.Tensor('int64', tokens, [1, tokens.length]),
        speed: new ort.Tensor('float32', Float32Array.of(speed), [1]),
      }
      let result: Awaited<ReturnType<typeof runtime.session.run>> | undefined
      try {
        result = await runtime.session.run(inputs)
        const audio = result.waveform?.data
        if (!(audio instanceof Float32Array)) {
          throw new Error('The speech model returned audio in an unsupported format.')
        }
        audioChunks.push(audio.slice())
        generated = true
      } finally {
        Object.values(result ?? {}).forEach((tensor) => tensor.dispose())
        Object.values(inputs).forEach((tensor) => tensor.dispose())
      }

      if (pieceIndex < pieces.length - 1) audioChunks.push(createSilence(clausePauseMs))
    }

    if (sentenceIndex < sentences.length - 1) {
      audioChunks.push(createSilence(sentencePauseMs))
    }
  }

  if (!generated) {
    throw new Error('No supported speech sounds were found on this page.')
  }

  const totalSamples = audioChunks.reduce((total, chunk) => total + chunk.length, 0)
  const samples = new Float32Array(totalSamples)
  let offset = 0
  for (const chunk of audioChunks) {
    samples.set(chunk, offset)
    offset += chunk.length
  }
  return encodeWav(samples)
}