/// <reference types="vite/client" />

declare const __EDMS_LAN_ORIGIN__: string

interface ImportMetaEnv {
  readonly VITE_PUBLIC_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
