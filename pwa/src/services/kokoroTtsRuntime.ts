import { unzipSync } from 'fflate'
import * as ort from 'onnxruntime-web/wasm'
import { phonemize } from 'phonemizer'

const bundleBaseUrl =
  'https://huggingface.co/snow2357/koroko_int8/resolve/main/mobile_bundle'
const modelUrl = `${bundleBaseUrl}/kokoro_mobile_int8.onnx`
const voicesUrl = `${bundleBaseUrl}/voices_mobile.bin`
const metadataUrl = `${bundleBaseUrl}/kokoro_metadata.json`
const sampleRate = 24000
const maxTokensPerRun = 508
const warmVoice = 'tone_warm'
const language = 'en-us'
const assetDatabaseName = 'lemua-kokoro-assets'
const assetStoreName = 'assets'
const narrationDatabaseName = 'lemua-kokoro-narration-v3'
const audioStoreName = 'audio-chunks'

type Metadata = {
  tokenizer_vocab: Record<string, number>
}

type CachedAsset = {
  key: string
  buffer: ArrayBuffer
}

type CachedAudioChunk = {
  key: string
  audio: Blob
}

type KokoroRuntime = {
  session: ort.InferenceSession
  vocab: Map<string, number>
  voiceArchive: Record<string, Uint8Array>
}

let runtimePromise: Promise<KokoroRuntime> | undefined
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
      reject(request.error ?? new Error('Could not read saved Kokoro files.'))
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not read saved Kokoro files.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Reading saved Kokoro files was aborted.'))
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
      reject(transaction.error ?? new Error('Could not save Kokoro files on this device.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Saving Kokoro files was aborted.'))
    }
  }).catch((error: unknown) => {
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'UnknownError')
    ) {
      throw new Error(
        'There is not enough browser storage to save the Kokoro files. Free device storage and try again.',
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
    throw new Error(`Could not download the Kokoro ${label} (HTTP ${response.status}).`)
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
        throw new Error(`The downloaded Kokoro ${label} is larger than expected.`)
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
      throw new Error(`The downloaded Kokoro ${label} is incomplete.`)
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

function getNpyDataOffset(bytes: Uint8Array): { offset: number; shape: number[] } {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x93 ||
    String.fromCharCode(...bytes.subarray(1, 6)) !== 'NUMPY'
  ) {
    throw new Error('The Kokoro voice archive contains an invalid NumPy file.')
  }

  const majorVersion = bytes[6]
  const headerLengthBytes = majorVersion === 1 ? 2 : 4
  const headerOffset = 8 + headerLengthBytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const headerLength =
    majorVersion === 1
      ? view.getUint16(8, true)
      : view.getUint32(8, true)
  const header = new TextDecoder().decode(
    bytes.subarray(headerOffset, headerOffset + headerLength),
  )
  const descriptor = /['"]descr['"]\s*:\s*['"]([^'"]+)['"]/.exec(header)?.[1]
  const shapeText = /['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(header)?.[1]
  if ((descriptor !== '<f4' && descriptor !== '|f4') || !shapeText) {
    throw new Error('The Kokoro voice embedding has an unsupported format.')
  }

  const shape = shapeText
    .split(',')
    .map((dimension) => Number(dimension.trim()))
    .filter((dimension) => Number.isInteger(dimension) && dimension > 0)
  if (shape.length !== 3 || shape[1] !== 1 || shape[2] !== 256) {
    throw new Error('The Kokoro voice embedding has an unexpected shape.')
  }
  return { offset: headerOffset + headerLength, shape }
}

function createVoiceStyle(voiceData: Uint8Array, tokenCount: number): Float32Array {
  const { offset, shape } = getNpyDataOffset(voiceData)
  if (tokenCount >= shape[0]) {
    throw new Error('This page contains too much text to synthesize at once.')
  }

  const dataOffset = offset + tokenCount * 256 * Float32Array.BYTES_PER_ELEMENT
  const view = new DataView(
    voiceData.buffer,
    voiceData.byteOffset + dataOffset,
    256 * Float32Array.BYTES_PER_ELEMENT,
  )
  return Float32Array.from(
    { length: 256 },
    (_, index) => view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true),
  )
}

async function loadRuntime(
  onProgress: (message: string) => void,
): Promise<KokoroRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      onProgress('Loading Kokoro settings…')
      const [metadataBuffer, voiceBuffer, modelBuffer] = await Promise.all([
        fetchBuffer(metadataUrl, 'settings', onProgress),
        fetchBuffer(voicesUrl, 'voice pack', onProgress),
        fetchBuffer(modelUrl, 'INT8 model', onProgress),
      ])
      const metadata = JSON.parse(new TextDecoder().decode(metadataBuffer)) as Metadata
      if (!metadata.tokenizer_vocab) {
        throw new Error('The Kokoro settings do not include a phoneme vocabulary.')
      }

      const voiceArchive = unzipSync(new Uint8Array(voiceBuffer))
      if (!voiceArchive[`${warmVoice}.npy`]) {
        throw new Error(`The Kokoro voice pack does not include ${warmVoice}.`)
      }

      onProgress('Preparing the Kokoro model on this device…')
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated
        ? Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
        : 1
      const session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['wasm'],
      })

      const requiredInputs = ['tokens', 'style', 'speed']
      if (requiredInputs.some((name) => !session.inputNames.includes(name))) {
        await session.release()
        throw new Error('The downloaded Kokoro model has an unsupported input format.')
      }

      return {
        session,
        vocab: new Map(Object.entries(metadata.tokenizer_vocab)),
        voiceArchive,
      }
    })().catch((error: unknown) => {
      runtimePromise = undefined
      throw error
    })
  }
  return runtimePromise
}

function splitTokens(tokens: number[]): number[][] {
  const chunks: number[][] = []
  let current: number[] = []
  for (const token of tokens) {
    current.push(token)
    if (current.length === maxTokensPerRun) {
      chunks.push(current)
      current = []
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

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

export async function generateKokoroAudio(
  text: string,
  speed: number,
  onProgress: (message: string) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  const runtime = await loadRuntime(onProgress)
  signal?.throwIfAborted()
  onProgress('Preparing the page text…')
  const phonemeLines = await phonemize(text, language)
  signal?.throwIfAborted()
  const phonemes = phonemeLines.join(' ').trim()
  const tokens = Array.from(phonemes)
    .map((phoneme) => runtime.vocab.get(phoneme))
    .filter((token): token is number => token !== undefined)
  if (tokens.length === 0) {
    throw new Error('No supported speech sounds were found on this page.')
  }

  const voiceData = runtime.voiceArchive[`${warmVoice}.npy`]
  const audioChunks: Float32Array[] = []
  for (const tokenChunk of splitTokens(tokens)) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    signal?.throwIfAborted()
    onProgress('Generating speech with Kokoro on this device…')
    const paddedTokens = BigInt64Array.from([
      0n,
      ...tokenChunk.map((token) => BigInt(token)),
      0n,
    ])
    const inputs: Record<string, ort.Tensor> = {
      tokens: new ort.Tensor('int64', paddedTokens, [1, paddedTokens.length]),
      style: new ort.Tensor('float32', createVoiceStyle(voiceData, tokenChunk.length), [
        1,
        256,
      ]),
      speed: new ort.Tensor('float32', Float32Array.of(speed), [1]),
    }
    let result: Awaited<ReturnType<typeof runtime.session.run>> | undefined
    try {
      result = await runtime.session.run(inputs)
      const audio = result.audio?.data
      if (!(audio instanceof Float32Array)) {
        throw new Error('Kokoro returned audio in an unsupported format.')
      }
      audioChunks.push(audio.slice())
    } finally {
      Object.values(result ?? {}).forEach((tensor) => tensor.dispose())
      Object.values(inputs).forEach((tensor) => tensor.dispose())
    }
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
