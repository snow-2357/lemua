export type UserSettings = {
  name: string
  isDark: boolean
}

const databaseName = 'lemua'
const storeName = 'settings'
const settingsKey = 'user-preferences'
const defaultSettings: UserSettings = { name: 'Jamie', isDark: false }

let databasePromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)

    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'id' })
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = undefined
      }
      resolve(database)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('Could not open the settings database.'))
    }
    request.onblocked = () => {
      reject(new Error('The settings database is blocked by another tab.'))
    }
  }).catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  databasePromise = pending

  return pending
}

export async function loadSettings(): Promise<UserSettings> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readonly')
  const request = transaction.objectStore(storeName).get(settingsKey)
  const record: unknown = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => {
      reject(request.error ?? new Error('Could not read saved settings.'))
    }
  })

  if (typeof record !== 'object' || record === null) return defaultSettings

  return {
    name:
      'name' in record && typeof record.name === 'string'
        ? record.name
        : defaultSettings.name,
    isDark:
      'isDark' in record && typeof record.isDark === 'boolean'
        ? record.isDark
        : defaultSettings.isDark,
  }
}

export async function persistSettings(
  changes: Partial<UserSettings>,
): Promise<void> {
  const database = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    const store = transaction.objectStore(storeName)
    const request = store.get(settingsKey)
    request.onsuccess = () => {
      const current: unknown = request.result
      const previous =
        typeof current === 'object' && current !== null ? current : {}
      const settings: UserSettings = {
        name:
          'name' in previous && typeof previous.name === 'string'
            ? previous.name
            : defaultSettings.name,
        isDark:
          'isDark' in previous && typeof previous.isDark === 'boolean'
            ? previous.isDark
            : defaultSettings.isDark,
        ...changes,
      }
      store.put({ id: settingsKey, ...settings })
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Could not save settings.'))
    }
    transaction.onabort = () => {
      reject(transaction.error ?? new Error('Saving settings was aborted.'))
    }
  })
}
