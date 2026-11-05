import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeModules } from 'react-native';
import type { OpenPhonemizer } from 'expo-open-phonemizer';
import type { InferenceSession } from 'onnxruntime-react-native';
import kokoroModel from '../../assets/kokoro/kokoro_mobile_int8.onnx';
import kokoroWarmVoice from '../../assets/kokoro/tone_warm.npy';
import metadata from '../../assets/kokoro/kokoro_metadata.json';

const SAMPLE_RATE = 24000;
const STYLE_DIMENSION = 256;
const MAX_PHONEME_COUNT = 508;

type KokoroResources = {
  onnxRuntime: typeof import('onnxruntime-react-native');
  session: InferenceSession;
  phonemizer: OpenPhonemizer;
};

const tokenizerVocabulary = metadata.tokenizer_vocab as Record<string, number>;
let resourcesPromise: Promise<KokoroResources> | null = null;
let voiceData: Float32Array | null = null;
let voiceLoadPromise: Promise<Float32Array> | null = null;
let activeSynthesisCount = 0;
let pendingReleasePromise: Promise<void> | null = null;
let releaseWaiters: (() => void)[] = [];
const chapterAudioPromises = new Map<string, Promise<string>>();

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

async function loadAssetUri(moduleId: number): Promise<string> {
  const asset = Asset.fromModule(moduleId);
  if (!asset.localUri) await asset.downloadAsync();
  const uri = asset.localUri;
  if (!uri) throw new Error(`Could not load the local asset ${asset.name}.${asset.type}.`);
  return uri;
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

  const modelUri = await loadAssetUri(kokoroModel);
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

function readNumpyFloatArray(file: Uint8Array): Float32Array {
  const signature = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
  if (!signature.every((byte, index) => file[index] === byte)) {
    throw new Error('The selected Kokoro voice data has an invalid NumPy header.');
  }

  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const majorVersion = file[6];
  const headerLength =
    majorVersion === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const dataOffset = majorVersion === 1 ? 10 + headerLength : 12 + headerLength;
  if (dataOffset > file.byteLength || (file.byteLength - dataOffset) % 4 !== 0) {
    throw new Error('The selected Kokoro voice data is truncated or malformed.');
  }

  const count = (file.byteLength - dataOffset) / 4;
  const values = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    values[index] = view.getFloat32(dataOffset + index * 4, true);
  }
  if (count < 510 * STYLE_DIMENSION) {
    throw new Error('The selected Kokoro voice data does not contain enough style vectors.');
  }
  return values;
}

async function loadVoiceData(): Promise<Float32Array> {
  if (voiceData) return voiceData;
  if (!voiceLoadPromise) {
    voiceLoadPromise = (async () => {
      const uri = await loadAssetUri(kokoroWarmVoice);
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Could not read the Kokoro voice data (${response.status}).`);
      }
      return readNumpyFloatArray(new Uint8Array(await response.arrayBuffer()));
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
