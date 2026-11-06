const narrationDatabaseName = 'lemua-kokoro-narration-v3';
const audioStoreName = 'audio-chunks';
const sequenceStoreName = 'audio-sequences';

type NarrationSequence = {
  key: string;
  bookId: string;
  chapterIndex: number;
  speed: number;
  chunkKeys: string[];
};

type PendingRequest = {
  resolve: (audio?: Blob) => void;
  reject: (error: Error) => void;
  onProgress: (message: string) => void;
  cleanup: () => void;
};

type InFlightChunk = {
  controller: AbortController;
  promise: Promise<Blob>;
  consumers: Set<symbol>;
  progressListeners: Map<symbol, (message: string) => void>;
};

let narrationDatabasePromise: Promise<IDBDatabase> | undefined;
let generationWorker: Worker | undefined;
let nextRequestId = 0;
const pendingRequests = new Map<number, PendingRequest>();
const inFlightChunks = new Map<string, InFlightChunk>();
let preloadPromise: Promise<void> | undefined;

function openNarrationDatabase(): Promise<IDBDatabase> {
  if (!narrationDatabasePromise) {
    narrationDatabasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(narrationDatabaseName, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(audioStoreName)) {
          database.createObjectStore(audioStoreName, { keyPath: 'key' });
        }
        if (!database.objectStoreNames.contains(sequenceStoreName)) {
          database.createObjectStore(sequenceStoreName, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          narrationDatabasePromise = undefined;
        };
        resolve(database);
      };
      request.onerror = () => {
        narrationDatabasePromise = undefined;
        reject(request.error ?? new Error('Could not open narration storage.'));
      };
      request.onblocked = () => {
        narrationDatabasePromise = undefined;
        reject(new Error('Narration storage is blocked by another tab.'));
      };
    });
  }
  return narrationDatabasePromise;
}

function saveNarrationSequence(sequence: NarrationSequence): Promise<void> {
  return openNarrationDatabase().then(
    (database) =>
      new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          sequenceStoreName,
          'readwrite'
        );
        transaction.objectStore(sequenceStoreName).put(sequence);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          reject(
            transaction.error ?? new Error('Could not save narration order.')
          );
        };
        transaction.onabort = () => {
          reject(
            transaction.error ??
              new Error('Saving narration order was aborted.')
          );
        };
      })
  );
}

async function hashText(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function prepareNarrationSequence(
  bookId: string,
  chapterIndex: number,
  chunks: string[],
  speed: number
): Promise<{ chunkKeys: string[] }> {
  const sequenceSignature = await hashText(chunks.join('\u001e'));
  const key = [
    encodeURIComponent(bookId),
    chapterIndex,
    'tone_warm',
    speed,
    sequenceSignature,
  ].join(':');
  const chunkKeys = await Promise.all(
    chunks.map(
      async (text) => `kokoro:v4:tone_warm:${speed}:${await hashText(text)}`
    )
  );
  await saveNarrationSequence({ key, bookId, chapterIndex, speed, chunkKeys });
  return { chunkKeys };
}

function getWorker(): Worker {
  if (!generationWorker) {
    const worker = new Worker(
      new URL('./kokoroTts.worker.ts', import.meta.url),
      {
        type: 'module',
      }
    );
    worker.onmessage = (event: MessageEvent<NarrationWorkerResponse>) => {
      const response = event.data;
      const pending = pendingRequests.get(response.id);
      if (!pending) return;

      if (response.type === 'progress') {
        pending.onProgress(response.message);
      } else {
        pendingRequests.delete(response.id);
        pending.cleanup();
        if (response.type === 'result') pending.resolve(response.audio);
        else if (response.type === 'ready') pending.resolve();
        else pending.reject(new Error(response.message));
      }
    };
    worker.onerror = (event) => {
      const error = new Error(
        event.message || 'Kokoro narration worker failed.'
      );
      pendingRequests.forEach(({ reject, cleanup }) => {
        cleanup();
        reject(error);
      });
      pendingRequests.clear();
      worker.terminate();
      if (generationWorker === worker) generationWorker = undefined;
    };
    generationWorker = worker;
  }
  return generationWorker;
}

export function preloadKokoroAssets(): Promise<void> {
  if (!preloadPromise) {
    const id = ++nextRequestId;
    const worker = getWorker();
    preloadPromise = new Promise<void>((resolve, reject) => {
      pendingRequests.set(id, {
        resolve: () => resolve(),
        reject,
        onProgress: () => {},
        cleanup: () => {},
      });
      try {
        worker.postMessage({
          id,
          type: 'preload',
        } satisfies NarrationWorkerRequest);
      } catch (error) {
        pendingRequests.delete(id);
        reject(error);
      }
    }).catch((error: unknown) => {
      preloadPromise = undefined;
      throw error;
    });
  }
  return preloadPromise;
}

function requestChunk(
  key: string,
  text: string,
  speed: number,
  onProgress: (message: string) => void,
  signal: AbortSignal
): Promise<Blob> {
  signal.throwIfAborted();
  const id = ++nextRequestId;
  const worker = getWorker();
  return new Promise<Blob>((resolve, reject) => {
    const abort = () => {
      pendingRequests.delete(id);
      worker.postMessage({
        id,
        type: 'cancel',
      } satisfies NarrationWorkerRequest);
      reject(signal.reason);
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    pendingRequests.set(id, {
      resolve: (audio) => {
        if (audio) resolve(audio);
        else reject(new Error('The narration worker returned no audio.'));
      },
      reject,
      onProgress,
      cleanup,
    });
    signal.addEventListener('abort', abort, { once: true });
    try {
      worker.postMessage({
        id,
        type: 'generate',
        key,
        text,
        speed,
      } satisfies NarrationWorkerRequest);
    } catch (error) {
      pendingRequests.delete(id);
      cleanup();
      reject(error);
    }
  });
}

export async function getOrGenerateNarrationChunk(
  key: string,
  text: string,
  speed: number,
  onProgress: (message: string) => void,
  signal: AbortSignal
): Promise<Blob> {
  signal.throwIfAborted();
  const database = await openNarrationDatabase();
  const cached = await new Promise<Blob | undefined>((resolve, reject) => {
    const transaction = database.transaction(audioStoreName, 'readonly');
    const request = transaction.objectStore(audioStoreName).get(key);
    request.onsuccess = () => {
      const record: unknown = request.result;
      resolve(
        typeof record === 'object' &&
          record !== null &&
          'audio' in record &&
          record.audio instanceof Blob
          ? record.audio
          : undefined
      );
    };
    request.onerror = () =>
      reject(
        request.error ?? new Error('Could not read saved narration audio.')
      );
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('Reading saved narration was aborted.')
      );
  });
  signal.throwIfAborted();
  // Cached playback must never wait behind inference jobs in the worker.
  if (cached instanceof Blob) return cached;

  let pending = inFlightChunks.get(key);
  if (!pending) {
    const controller = new AbortController();
    const created: InFlightChunk = {
      controller,
      promise: Promise.resolve(new Blob()),
      consumers: new Set(),
      progressListeners: new Map(),
    };
    created.promise = requestChunk(
      key,
      text,
      speed,
      (message) =>
        created.progressListeners.forEach((listener) => listener(message)),
      controller.signal
    );
    pending = created;
    inFlightChunks.set(key, pending);
    void created.promise.then(
      () => {
        if (inFlightChunks.get(key) === created) inFlightChunks.delete(key);
      },
      () => {
        if (inFlightChunks.get(key) === created) inFlightChunks.delete(key);
      }
    );
  }

  const consumer = Symbol(key);
  pending.consumers.add(consumer);
  pending.progressListeners.set(consumer, onProgress);
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const release = () => {
      if (settled) return false;
      settled = true;
      signal.removeEventListener('abort', abort);
      pending?.consumers.delete(consumer);
      pending?.progressListeners.delete(consumer);
      if (
        pending?.consumers.size === 0 &&
        inFlightChunks.get(key) === pending
      ) {
        inFlightChunks.delete(key);
        pending.controller.abort();
      }
      return true;
    };
    const abort = () => {
      const error =
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('The operation was aborted.', 'AbortError');
      if (release()) reject(error);
    };

    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    pending?.promise.then(
      (audio) => {
        if (release()) resolve(audio);
      },
      (error: unknown) => {
        if (release()) reject(error);
      }
    );
  });
}
import type {
  NarrationWorkerRequest,
  NarrationWorkerResponse,
} from './narrationWorkerTypes';
