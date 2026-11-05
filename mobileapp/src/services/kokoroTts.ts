import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules } from 'react-native';
import type { OpenPhonemizer } from 'expo-open-phonemizer';
import type { InferenceSession } from 'onnxruntime-react-native';

const bundleBaseUrl =
  'https://huggingface.co/snow2357/koroko_int8/resolve/main/mobile_bundle'
const modelUrl = `${bundleBaseUrl}/kokoro_mobile_int8.onnx`
const voicesUrl = `${bundleBaseUrl}/voices_mobile.bin`
const metadataUrl = `${bundleBaseUrl}/kokoro_metadata.json`
const SAMPLE_RATE = 24000;
const STYLE_DIMENSION = 256;
const MAX_PHONEME_COUNT = 508;

type Metadata = {
  tokenizer_vocab: Record<string, number>
}

type KokoroResources = {
  onnxRuntime: typeof import('onnxruntime-react-native');
  session: InferenceSession;
  phonemizer: OpenPhonemizer;
};

let metadata: Metadata | null = null
const tokenizerVocabulary: Record<string, number> = {};
let resourcesPromise: Promise<KokoroResources> | null = null;
let voiceData: Float32Array | null = null;
let voiceLoadPromise: Promise<Float32Array> | null = null;
let activeSynthesisCount = 0;
let pendingReleasePromise: Promise<void> | null = null;
let releaseWaiters: (() => void)[] = [];
const chapterAudioPromises = new Map<string, Promise<string>>();
let initializationPromise: Promise<void> | null = null;

function adaptPhonemizerOutput(phonemizer: OpenPhonemizer): void {
  const [outputName] = phonemizer.session.outputNames;
  if (!outputName) {
    throw new Error('The phonemizer model does not expose an output tensor.');
  }
  if (outputName === 'output') return;

  const run = phonemizer.session.run.bind(phonemizer.session);
  phonemizer.session.run = async (feeds) => {
    const outputs = await run(feeds);
    if (outputs.output || !outputs[outputName]) return outputs;
    return { ...outputs, output: outputs[outputName] };
  };
}

function isOnnxRuntimeModule(
  value: unknown,
): value is typeof import('onnxruntime-react-native') {
  if (typeof value !== 'object' || value === null) return false;
  const inferenceSession = Reflect.get(value, 'InferenceSession');
  return (
    typeof inferenceSession === 'function' &&
    typeof Reflect.get(inferenceSession, 'create') === 'function'
  );
}

function resolveOnnxRuntimeModule(
  value: unknown,
): typeof import('onnxruntime-react-native') | null {
  if (isOnnxRuntimeModule(value)) return value;
  if (typeof value !== 'object' || value === null) return null;
  const defaultExport = Reflect.get(value, 'default');
  return isOnnxRuntimeModule(defaultExport) ? defaultExport : null;
}

function assertOnnxNativeModuleAvailable(): void {
  const nativeModule: unknown = Reflect.get(NativeModules, 'Onnxruntime');
  if (
    typeof nativeModule !== 'object' ||
    nativeModule === null ||
    typeof Reflect.get(nativeModule, 'install') !== 'function'
  ) {
    throw new Error(
      'Kokoro needs the native ONNX Runtime module, which is missing from this Android app. Build and install a new development app; Expo Go and older installed builds are not supported.',
    );
  }
}

async function downloadFromUrl(url: string, cacheDir: string, fileName: string): Promise<string> {
  const filePath = `${cacheDir}${fileName}`
  const fileInfo = await FileSystem.getInfoAsync(filePath)
  
  if (fileInfo.exists) {
    return filePath
  }

  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    filePath,
    {}
  )

  try {
    const result = await downloadResumable.downloadAsync()
    if (!result) {
      throw new Error(`Failed to download ${fileName} from ${url}`)
    }
    return result.uri
  } catch (error) {
    throw new Error(`Could not download ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function loadMetadata(): Promise<Metadata> {
  if (metadata) return metadata
  
  const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory
  if (!cacheDir) throw new Error('Cache directory is not available')
  
  const metadataPath = await downloadFromUrl(metadataUrl, cacheDir, 'kokoro_metadata.json')
  const content = await FileSystem.readAsStringAsync(metadataPath)
  metadata = JSON.parse(content) as Metadata
  
  // Populate tokenizer vocabulary
  Object.assign(tokenizerVocabulary, metadata.tokenizer_vocab)
  
  return metadata
}

async function loadAssetUri(url: string, fileName: string): Promise<string> {
  const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory
  if (!cacheDir) throw new Error('Cache directory is not available')
  return downloadFromUrl(url, cacheDir, fileName)
}

async function loadResources(): Promise<KokoroResources> {
  assertOnnxNativeModuleAvailable();

  let loadedRuntime: unknown;
  try {
    loadedRuntime = await import('onnxruntime-react-native');
  } catch (error) {
    if (
      error instanceof Error &&
      /Cannot read propert(?:y|ies).*install/i.test(error.message)
    ) {
      throw new Error(
        'Kokoro could not initialize native ONNX Runtime. Rebuild and reinstall the development app with the ONNX Runtime module enabled.',
      );
    }
    throw error;
  }
  const onnxRuntime = resolveOnnxRuntimeModule(loadedRuntime);
  if (!onnxRuntime) {
    throw new Error(
      'The native ONNX Runtime did not expose InferenceSession.create. Rebuild and reinstall the app with the ONNX Runtime native module enabled.',
    );
  }

  await loadMetadata()
  const modelUri = await loadAssetUri(modelUrl, 'kokoro_mobile_int8.onnx');
  const session = await onnxRuntime.InferenceSession.create(modelUri, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
    enableMemPattern: true,
    executionMode: 'sequential',
  });

  let phonemizer: OpenPhonemizer | null = null;
  try {
    const { OpenPhonemizer } = await import('expo-open-phonemizer');
    phonemizer = await OpenPhonemizer.load();
    adaptPhonemizerOutput(phonemizer);
    return { onnxRuntime, session, phonemizer };
  } catch (error) {
    if (phonemizer) await phonemizer.session.release();
    await session.release();
    throw error;
  }
}

function getResources(): Promise<KokoroResources> {
  if (!resourcesPromise) {
    resourcesPromise = loadResources().catch((error: unknown) => {
      resourcesPromise = null;
      throw error;
    });
  }
  return resourcesPromise;
}

/**
 * Initialize Kokoro TTS by loading all assets into memory.
 * Call this when the app starts to pre-load resources.
 * Subsequent calls will use cached in-memory resources.
 */
export async function initializeKokoro(): Promise<void> {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      // Load both resources and voice data in parallel
      await Promise.all([
        getResources(),
        loadVoiceData(),
      ]);
    } catch (error) {
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

function getNpyDataOffset(bytes: Uint8Array): { offset: number; shape: number[] } {
  if (bytes.length < 10) {
    throw new Error(`NumPy file too short: ${bytes.length} bytes (need at least 10)`)
  }
  
  if (bytes[0] !== 0x93) {
    throw new Error(`Invalid NumPy signature byte[0]: ${bytes[0].toString(16)} (expected 0x93)`)
  }
  
  const magicString = String.fromCharCode(...bytes.subarray(1, 6));
  if (magicString !== 'NUMPY') {
    throw new Error(`Invalid NumPy magic string: "${magicString}" (expected "NUMPY")`)
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

function readNumpyFloatArray(file: Uint8Array): Float32Array {
  const { offset, shape } = getNpyDataOffset(file)
  const count = shape[0]
  const values = new Float32Array(count * STYLE_DIMENSION)
  const view = new DataView(file.buffer, file.byteOffset + offset, count * STYLE_DIMENSION * Float32Array.BYTES_PER_ELEMENT)
  
  for (let index = 0; index < count * STYLE_DIMENSION; index += 1) {
    values[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true)
  }
  
  return values
}

async function loadVoiceData(): Promise<Float32Array> {
  if (voiceData) return voiceData;
  if (!voiceLoadPromise) {
    voiceLoadPromise = (async () => {
      const uri = await loadAssetUri(voicesUrl, 'voices_mobile.bin');
      console.log('[Kokoro] Loading voice data from:', uri);
      
      // Read file as base64, then convert to Uint8Array
      const base64Data = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      console.log('[Kokoro] Voice data base64 length:', base64Data.length);
      
      // Decode base64 to binary - proper conversion for React Native
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      
      for (let i = 0; i < len; i++) {
        const code = binaryString.charCodeAt(i);
        bytes[i] = code & 0xff;  // Ensure value is 0-255
      }
      
      console.log('[Kokoro] Voice data bytes length:', bytes.length);
      console.log('[Kokoro] First bytes (NumPy signature):', bytes[0].toString(16), bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
      
      return readNumpyFloatArray(bytes);
    })();
  }

  try {
    voiceData = await voiceLoadPromise;
    return voiceData;
  } finally {
    voiceLoadPromise = null;
  }
}

function normalizePhonemes(phonemes: string): string {
  const normalized = phonemes
    .replace(/ɝ/g, 'ɜːɹ')
    // Kokoro has no syllabic-consonant marker, so approximate it with a schwa.
    .replace(/([mnrl])\u0329/g, 'ə$1')
    .replace(/r/g, 'ɹ')
    .replace(/ʲ/g, '')
    .replace(/['‘’]/g, '"')
    .replace(/-/g, '—')
    .trim();

  return Array.from(normalized, (character) =>
    tokenizerVocabulary[character] === undefined ? ' ' : character,
  ).join('').replace(/\s+/g, ' ').trim();
}

function normalizeSpeechText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[_\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s.,!?;:"'()—…“”‘’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitPhonemes(phonemes: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const word of phonemes.match(/\S+\s*/gu) ?? []) {
    const wordLength = Array.from(word).length;
    if (current && Array.from(current).length + wordLength > MAX_PHONEME_COUNT) {
      chunks.push(current.trim());
      current = '';
    }
    if (wordLength <= MAX_PHONEME_COUNT) {
      current += word;
      continue;
    }

    const characters = Array.from(word);
    while (characters.length > 0) {
      chunks.push(characters.splice(0, MAX_PHONEME_COUNT).join('').trim());
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function encodePhonemes(phonemes: string): number[] {
  const tokens = [0];
  for (const character of phonemes) {
    const token = tokenizerVocabulary[character];
    if (token === undefined) {
      throw new Error(
        `Kokoro cannot pronounce the unsupported phoneme "${character}".`,
      );
    }
    tokens.push(token);
  }
  tokens.push(0);
  return tokens;
}

async function synthesizeChunk(
  resources: KokoroResources,
  phonemes: string,
  voice: Float32Array,
  speed: number,
): Promise<Float32Array> {
  const tokens = encodePhonemes(phonemes);
  const styleIndex = Math.min(tokens.length - 2, 509);
  const styleOffset = styleIndex * STYLE_DIMENSION;
  const outputs = await resources.session.run({
    tokens: new resources.onnxRuntime.Tensor(
      'int64',
      BigInt64Array.from(tokens, (token) => BigInt(token)),
      [1, tokens.length],
    ),
    style: new resources.onnxRuntime.Tensor(
      'float32',
      voice.slice(styleOffset, styleOffset + STYLE_DIMENSION),
      [1, STYLE_DIMENSION],
    ),
    speed: new resources.onnxRuntime.Tensor(
      'float32',
      new Float32Array([speed]),
      [1],
    ),
  });
  const audio = outputs.audio?.data;
  if (!(audio instanceof Float32Array) || audio.length === 0) {
    throw new Error('Kokoro returned an empty or invalid audio output.');
  }
  return audio;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function toWavBase64(samples: Float32Array): string {
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(
      44 + index * 2,
      sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767),
      true,
    );
  }
  return toBase64(bytes);
}

function hashCacheKey(value: string): string {
  let hash = 14695981039346656037n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16).padStart(16, '0');
}

async function synthesizeKokoroAudioInternal(
  text: string,
  speed: number,
): Promise<string> {
  if (!text.trim()) throw new Error('There is no readable text on this page.');
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new Error('Kokoro speech speed must be between 0.5× and 2×.');
  }

  const resources = await getResources();
  // Add pause markers at sentence boundaries (periods, question marks, exclamation marks)
  const textWithPauses = text
    .replace(/([.!?])\s+/g, '$1... ')
    .replace(/\n\n+/g, '... ... ')
  const speechText = normalizeSpeechText(textWithPauses);
  const phonemes = normalizePhonemes(
    speechText
      ? await resources.phonemizer.phonemize(speechText, true)
      : '',
  );
  const phonemeChunks = splitPhonemes(phonemes);
  const voice = phonemeChunks.length > 0 ? await loadVoiceData() : null;

  const generatedChunks: Float32Array[] = [];
  let sampleCount = 0;
  if (voice) {
    for (const chunk of phonemeChunks) {
      const audio = await synthesizeChunk(resources, chunk, voice, speed);
      generatedChunks.push(audio);
      sampleCount += audio.length;
    }
  }

  if (phonemeChunks.length === 0) {
    sampleCount = Math.floor(SAMPLE_RATE / 4);
  }
  const samples = new Float32Array(sampleCount);
  let offset = 0;
  for (const chunk of generatedChunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  if (!FileSystem.cacheDirectory) {
    throw new Error('The temporary audio directory is not available.');
  }
  const uri = `${FileSystem.cacheDirectory}kokoro-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.wav`;
  await FileSystem.writeAsStringAsync(uri, toWavBase64(samples), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

export async function synthesizeKokoroAudio(
  text: string,
  speed: number,
): Promise<string> {
  if (pendingReleasePromise) await pendingReleasePromise;
  activeSynthesisCount += 1;
  try {
    return await synthesizeKokoroAudioInternal(text, speed);
  } finally {
    activeSynthesisCount -= 1;
    if (activeSynthesisCount === 0) {
      releaseWaiters.forEach((resolve) => resolve());
      releaseWaiters = [];
    }
  }
}

export async function synthesizeChapterPageAudio(
  bookId: string,
  chapterIndex: number,
  text: string,
  speed: number,
): Promise<string> {
  if (!bookId.trim()) throw new Error('A book ID is required to save chapter audio.');
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0) {
    throw new Error('The chapter index must be a non-negative integer.');
  }
  if (!text.trim()) throw new Error('There is no readable text on this page.');
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new Error('Kokoro speech speed must be between 0.5× and 2×.');
  }
  if (!FileSystem.documentDirectory) {
    throw new Error('The app document directory is not available on this device.');
  }

  const audioKey = hashCacheKey(`kokoro-v2:${speed}:${text}`);
  const bookKey = hashCacheKey(bookId);
  const directory = `${FileSystem.documentDirectory}audio/${bookKey}/chapter-${chapterIndex}/`;
  const audioUri = `${directory}${audioKey}.wav`;
  const existingRequest = chapterAudioPromises.get(audioUri);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const existingFile = await FileSystem.getInfoAsync(audioUri);
    if (existingFile.exists && (existingFile.size ?? 0) >= 44) return audioUri;
    if (existingFile.exists) await FileSystem.deleteAsync(audioUri);

    const temporaryUri = await synthesizeKokoroAudio(text, speed);
    try {
      await FileSystem.moveAsync({ from: temporaryUri, to: audioUri });
    } catch (error) {
      await FileSystem.deleteAsync(temporaryUri, { idempotent: true });
      throw error;
    }
    return audioUri;
  })();
  chapterAudioPromises.set(audioUri, request);
  try {
    return await request;
  } finally {
    if (chapterAudioPromises.get(audioUri) === request) {
      chapterAudioPromises.delete(audioUri);
    }
  }
}

export async function deleteKokoroAudio(uri: string): Promise<void> {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function releaseKokoroResources(): Promise<void> {
  if (!pendingReleasePromise) {
    pendingReleasePromise = (async () => {
      if (activeSynthesisCount > 0) {
        await new Promise<void>((resolve) => releaseWaiters.push(resolve));
      }

      const resourcesLoad = resourcesPromise;
      resourcesPromise = null;
      voiceData = null;
      voiceLoadPromise = null;
      if (!resourcesLoad) return;

      const resources = await resourcesLoad;
      await resources.phonemizer.session.release();
      await resources.session.release();
    })();
  }

  try {
    await pendingReleasePromise;
  } finally {
    pendingReleasePromise = null;
  }
}
