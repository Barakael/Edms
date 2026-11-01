const ACCEPTED_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp'])
const FOLDER_NAME_KEY = 'edms_bulk_watch_folder_name'
const IDB_NAME = 'edms-bulk-watch'
const IDB_STORE = 'handles'
const IDB_KEY = 'directory'

export type WatchedFile = {
  key: string
  name: string
  file: File
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export function isAcceptedFileName(name: string): boolean {
  const lower = name.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return false
  return ACCEPTED_EXT.has(lower.slice(dot))
}

export function fileWatchKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`
}

export function getRememberedFolderName(): string | null {
  try {
    return localStorage.getItem(FOLDER_NAME_KEY)
  } catch {
    return null
  }
}

function rememberFolderName(name: string) {
  try {
    localStorage.setItem(FOLDER_NAME_KEY, name)
  } catch {
    /* ignore */
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'))
  })
}

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  rememberFolderName(handle.name)
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Failed to save folder handle'))
  })
  db.close()
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb()
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null)
      req.onerror = () => reject(req.error || new Error('Failed to load folder handle'))
    })
    db.close()
    return handle
  } catch {
    return null
  }
}

export async function ensureDirectoryPermission(
  handle: FileSystemDirectoryHandle,
  request = false,
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: 'read' }
  try {
    let state = await handle.queryPermission(opts)
    if (state === 'granted') return true
    if (!request) return false
    state = await handle.requestPermission(opts)
    return state === 'granted'
  } catch {
    return false
  }
}

export async function pickWatchDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!supportsDirectoryPicker()) {
    throw new Error('Folder watching needs Chrome or Edge.')
  }
  const handle = await window.showDirectoryPicker!({ mode: 'read' })
  await saveDirectoryHandle(handle)
  return handle
}

export async function listAcceptedFiles(handle: FileSystemDirectoryHandle): Promise<WatchedFile[]> {
  const out: WatchedFile[] = []
  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') continue
    if (!isAcceptedFileName(entry.name)) continue
    const fileHandle = entry as FileSystemFileHandle
    const file = await fileHandle.getFile()
    out.push({ key: fileWatchKey(file), name: file.name, file })
  }
  return out
}

export function acceptAttribute(): string {
  return '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'
}
