import os from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_PORT = 5173

/** Prefer a private LAN IPv4 the iPhone can reach (not localhost). */
function lanIPv4(): string | null {
  let nets: NodeJS.Dict<os.NetworkInterfaceInfo[]>
  try {
    nets = os.networkInterfaces()
  } catch {
    return null
  }
  const candidates: string[] = []
  for (const name of Object.keys(nets)) {
    const entries = nets[name]
    if (!entries) continue
    for (const net of entries) {
      const family = String(net.family)
      const isV4 = family === 'IPv4' || family === '4'
      if (!isV4 || net.internal) continue
      candidates.push(net.address)
    }
  }
  return (
    candidates.find((a) => a.startsWith('192.168.')) ||
    candidates.find((a) => a.startsWith('10.')) ||
    candidates.find((a) => /^172\.(1[6-9]|2\d|3[0-1])\./.test(a)) ||
    candidates[0] ||
    null
  )
}

const lan = lanIPv4()
const lanOrigin = lan ? `http://${lan}:${DEV_PORT}` : ''

if (lanOrigin) {
  // eslint-disable-next-line no-console
  console.log(`[edms] iPhone capture origin → ${lanOrigin}`)
}

export default defineConfig({
  plugins: [react()],
  define: {
    __EDMS_LAN_ORIGIN__: JSON.stringify(lanOrigin),
  },
  server: {
    host: true,
    port: DEV_PORT,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
