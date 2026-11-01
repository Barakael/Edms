/// <reference types="vite/client" />

declare const __EDMS_LAN_ORIGIN__: string

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  readonly kind: 'file' | 'directory'
  readonly name: string
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: 'file'
  getFile(): Promise<File>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: 'directory'
  values(): AsyncIterableIterator<FileSystemHandle>
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

interface Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
  }) => Promise<FileSystemDirectoryHandle>
}

