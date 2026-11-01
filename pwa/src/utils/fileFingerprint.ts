export async function getFileFingerprint(file: Blob): Promise<string> {
  const contents = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', contents)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
