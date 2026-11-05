// Safari lacks ReadableStream async iteration, which the phonemizer package uses on load.
const streamPrototype = ReadableStream.prototype as ReadableStream & {
  [Symbol.asyncIterator]?: () => AsyncIterableIterator<unknown>
}

if (typeof streamPrototype[Symbol.asyncIterator] !== 'function') {
  streamPrototype[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
}

export {}
