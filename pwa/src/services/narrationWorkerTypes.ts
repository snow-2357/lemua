export type NarrationWorkerRequest =
  | { id: number; type: 'generate'; key: string; text: string; speed: number }
  | { id: number; type: 'preload' }
  | { id: number; type: 'cancel' }

export type NarrationWorkerResponse =
  | { id: number; type: 'progress'; message: string }
  | { id: number; type: 'result'; audio: Blob }
  | { id: number; type: 'ready' }
  | { id: number; type: 'error'; message: string }
