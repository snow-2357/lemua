export type NarrationWorkerRequest =
  | { id: number; type: 'generate'; key: string; text: string; speed: number }
  | { id: number; type: 'cancel' }

export type NarrationWorkerResponse =
  | { id: number; type: 'progress'; message: string }
  | { id: number; type: 'result'; audio: Blob }
  | { id: number; type: 'error'; message: string }
