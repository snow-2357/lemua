export type NarrationState = 'idle' | 'loading' | 'playing' | 'buffering' | 'paused' | 'finished' | 'error'

export type NarrationSnapshot = {
  state: NarrationState
  message: string
  error: string
  currentTime: number
  duration: number
  bufferedSeconds: number
  index: number
  audibleIndex: number | null
}

export type NarrationOutput = {
  readonly currentTime: number
  resume: () => Promise<void>
  suspend: () => Promise<void>
  close: () => Promise<void>
  decode: (audio: Blob) => Promise<AudioBuffer>
  schedule: (audio: AudioBuffer, start: number, ended: () => void) => () => void
}

type Dependencies = {
  createOutput: () => NarrationOutput
  prepare: (texts: string[]) => Promise<{ chunkKeys: string[] }>
  generate: (key: string, text: string, signal: AbortSignal, progress: (message: string) => void) => Promise<Blob>
}

type ScheduledPassage = {
  index: number
  start: number
  end: number
  duration: number
  stop: () => void
}

export const pausedNarrationWordLimit = 1000

export const initialNarrationSnapshot: NarrationSnapshot = {
  state: 'idle',
  message: 'Listen from this page · you can keep reading',
  error: '',
  currentTime: 0,
  duration: 0,
  bufferedSeconds: 0,
  index: -1,
  audibleIndex: null,
}

export function createNarrationOutput(): NarrationOutput {
  const context = new AudioContext()
  return {
    get currentTime() { return context.currentTime },
    resume: () => context.resume(),
    suspend: () => context.suspend(),
    close: () => context.close(),
    decode: async (audio) => context.decodeAudioData(await audio.arrayBuffer()),
    schedule: (audio, start, ended) => {
      const source = context.createBufferSource()
      source.buffer = audio
      source.connect(context.destination)
      source.onended = () => {
        source.disconnect()
        ended()
      }
      source.start(start)
      return () => {
        source.onended = null
        source.stop()
        source.disconnect()
      }
    },
  }
}

export class NarrationPlayer {
  private output: NarrationOutput | undefined
  private abort = new AbortController()
  private scheduled: ScheduledPassage[] = []
  private timer: ReturnType<typeof setInterval> | undefined
  private active = false
  private wanted = false
  private pumping = false
  private keys: string[] = []
  private nextIndex = 0
  private preparedIndex = 0
  private pausedBaseIndex = 0
  private pausedTargetIndex = 0
  private pausedGenerationAbort: AbortController | undefined
  private completedSeconds = 0
  private decodedSeconds = 0
  private lookaheadSeconds = 24
  private remainingWords: number[]
  private generatedWords = 0
  private snapshot = { ...initialNarrationSnapshot }
  private texts: string[]
  private dependencies: Dependencies
  private update: (snapshot: NarrationSnapshot) => void
  private passageChanged: (index: number) => void

  constructor(
    texts: string[],
    dependencies: Dependencies,
    update: (snapshot: NarrationSnapshot) => void,
    passageChanged: (index: number) => void,
  ) {
    this.texts = texts
    this.dependencies = dependencies
    this.update = update
    this.passageChanged = passageChanged
    this.remainingWords = Array.from({ length: texts.length + 1 }, () => 0)
    for (let index = texts.length - 1; index >= 0; index -= 1) {
      this.remainingWords[index] = this.remainingWords[index + 1] + texts[index].split(/\s+/).length
    }
  }

  async start(index: number): Promise<void> {
    if (this.active) return
    this.active = true
    this.wanted = true
    this.nextIndex = index
    this.preparedIndex = index
    this.snapshot.index = index
    this.publish('loading', 'Preparing narration · keep reading while it loads')
    try {
      this.output = this.dependencies.createOutput()
      // Unlock playback in the original click, before model loading or other async work.
      await this.output.resume()
      if (!this.active) return
      if (this.wanted) this.timer = setInterval(() => this.tick(), 250)
      const { chunkKeys } = await this.dependencies.prepare(this.texts)
      if (!this.active) return
      if (chunkKeys.length !== this.texts.length || this.texts.length === 0) {
        throw new Error('No narration passages are available for this chapter.')
      }
      this.keys = chunkKeys
      void this.pump()
    } catch (error) {
      if (this.active) this.fail(error)
    }
  }

  pause(): void {
    if (!this.active || !this.output) return
    if (!this.wanted) return
    const now = this.output.currentTime
    this.pausedBaseIndex = this.scheduled.find((passage) => passage.end > now)?.index ?? this.nextIndex
    this.pausedTargetIndex = this.pausedBaseIndex
    while (
      this.pausedTargetIndex < this.texts.length &&
      this.remainingWords[this.pausedBaseIndex] - this.remainingWords[this.pausedTargetIndex] < pausedNarrationWordLimit
    ) {
      this.pausedTargetIndex += 1
    }
    this.wanted = false
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.publishPaused()
    void this.output.suspend().catch((error: unknown) => {
      if (this.active) this.fail(error)
    })
    void this.pump()
  }

  async resume(): Promise<void> {
    if (!this.active || !this.output) return
    this.wanted = true
    // Let cached playback resume immediately instead of waiting for a distant prefetch.
    this.pausedGenerationAbort?.abort()
    try {
      await this.output.resume()
      if (!this.active || !this.wanted) return
      if (!this.timer) this.timer = setInterval(() => this.tick(), 250)
      this.tick()
    } catch (error) {
      if (this.active) this.fail(error)
    }
  }

  stop(): void {
    this.active = false
    this.wanted = false
    this.abort.abort()
    this.pausedGenerationAbort?.abort()
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.scheduled.forEach((passage) => passage.stop())
    this.scheduled = []
    const output = this.output
    this.output = undefined
    if (output) {
      void output.close().catch((error: unknown) => {
        console.error('Could not close the narration audio output.', error)
      })
    }
  }

  private publish(state: NarrationState, message: string) {
    const now = this.output?.currentTime ?? 0
    const current = this.scheduled.find((passage) => passage.start <= now && passage.end > now)
    const currentTime = this.completedSeconds + (current ? now - current.start : 0)
    const secondsPerWord = this.generatedWords > 0 ? this.decodedSeconds / this.generatedWords : 1 / 2.6
    this.snapshot = {
      ...this.snapshot,
      state,
      message,
      audibleIndex: state === 'playing'
        ? current?.index ?? null
        : state === 'paused' ? current?.index ?? this.snapshot.audibleIndex : null,
      currentTime,
      duration: Math.max(currentTime, this.decodedSeconds + this.remainingWords[this.nextIndex] * secondsPerWord),
      bufferedSeconds: this.scheduled.reduce(
        (seconds, passage) => seconds + Math.max(0, passage.end - Math.max(now, passage.start)), 0,
      ),
    }
    this.update(this.snapshot)
  }

  private fail(error: unknown) {
    console.error('Could not prepare or play narration.', error)
    this.stop()
    this.snapshot.error = error instanceof Error ? error.message : 'Could not play narration on this device.'
    this.publish('error', 'Narration stopped · tap play to retry')
  }

  private publishPaused() {
    const savedWords = this.remainingWords[this.pausedBaseIndex] -
      this.remainingWords[Math.max(this.pausedBaseIndex, this.preparedIndex)]
    this.publish(
      'paused',
      this.preparedIndex < this.pausedTargetIndex
        ? `Paused · saving up to ~${pausedNarrationWordLimit} words ahead (${savedWords} ready)`
        : `Paused · ${savedWords} words saved ahead${this.preparedIndex === this.texts.length ? ' · chapter end' : ''}`,
    )
  }

  private tick() {
    const output = this.output
    if (!this.active || !output || !this.wanted) return
    while (this.scheduled[0] && this.scheduled[0].end <= output.currentTime) {
      const completed = this.scheduled.shift()
      if (completed) this.completedSeconds += completed.duration
    }
    const current = this.scheduled[0]
    if (current && current.start <= output.currentTime && current.index !== this.snapshot.index) {
      this.snapshot.index = current.index
      this.passageChanged(current.index)
    }
    if (!current && this.nextIndex === this.texts.length && !this.pumping) {
      this.publish('finished', 'Chapter finished · tap play to listen again')
      this.stop()
      return
    }
    this.publish(
      current ? 'playing' : this.decodedSeconds > 0 ? 'buffering' : 'loading',
      current
        ? `Listening · ${Math.ceil(this.snapshot.bufferedSeconds)}s buffered ahead`
        : this.decodedSeconds > 0
          ? 'Preparing more audio · you can keep reading'
          : this.snapshot.message,
    )
    void this.pump()
  }

  private async pump(): Promise<void> {
    if (this.pumping || !this.active || this.keys.length === 0) return
    const output = this.output
    if (!output) return
    this.pumping = true
    try {
      while (this.active) {
        if (!this.wanted) {
          if (this.preparedIndex >= this.pausedTargetIndex) {
            this.publishPaused()
            break
          }
          const index = this.preparedIndex
          const abort = new AbortController()
          this.pausedGenerationAbort = abort
          try {
            // Generation persists the WAV; do not retain or decode this larger disk buffer.
            await this.dependencies.generate(this.keys[index], this.texts[index], abort.signal, () => {})
            if (!this.active) return
            if (!abort.signal.aborted) this.preparedIndex = index + 1
          } catch (error) {
            if (!abort.signal.aborted) throw error
          } finally {
            this.pausedGenerationAbort = undefined
          }
          if (this.active && !this.wanted) this.publishPaused()
          continue
        }
        if (this.nextIndex >= this.texts.length) break
        const tail = this.scheduled.at(-1)
        if (this.scheduled.length >= 4 ||
          (tail && tail.end - output.currentTime >= this.lookaheadSeconds)) break
        const index = this.nextIndex
        const startedAt = performance.now()
        const audio = await this.dependencies.generate(
          this.keys[index], this.texts[index], this.abort.signal,
          (message) => {
            if (this.active && this.wanted && this.scheduled.length === 0) {
              this.publish(this.decodedSeconds > 0 ? 'buffering' : 'loading', message)
            }
          },
        )
        if (!this.active) return
        this.preparedIndex = Math.max(this.preparedIndex, index + 1)
        const decoded = await output.decode(audio)
        if (!this.active) return
        if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) {
          throw new Error('The generated narration contains no playable audio.')
        }
        const generationSeconds = (performance.now() - startedAt) / 1000
        this.lookaheadSeconds = Math.max(20, Math.min(60, generationSeconds * 3 + 12))
        const start = Math.max(output.currentTime + 0.04, this.scheduled.at(-1)?.end ?? 0)
        const stop = output.schedule(decoded, start, () => this.tick())
        this.scheduled.push({ index, start, end: start + decoded.duration, duration: decoded.duration, stop })
        this.decodedSeconds += decoded.duration
        this.generatedWords += this.remainingWords[index] - this.remainingWords[index + 1]
        this.nextIndex += 1
        if (this.wanted) this.tick()
      }
    } catch (error) {
      if (this.active && !this.abort.signal.aborted) this.fail(error)
    } finally {
      this.pumping = false
    }
  }
}
