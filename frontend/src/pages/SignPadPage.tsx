import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PointerTrackpadAdapter } from '../signatures/PointerTrackpadAdapter'
import './SignPadPage.css'

export function SignPadPage() {
  const { token } = useParams()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const adapterRef = useRef<PointerTrackpadAdapter | null>(null)
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !token) return

    const width = Math.min(window.innerWidth - 32, 640)
    const height = Math.round(width * 0.45)
    canvas.width = width
    canvas.height = height

    const adapter = new PointerTrackpadAdapter(canvas)
    adapterRef.current = adapter
    void adapter.startCapture().then(() => setReady(true))

    return () => {
      adapter.dispose()
      adapterRef.current = null
    }
  }, [token])

  async function submit() {
    if (!token || submitting) return
    setError('')
    setSubmitting(true)
    try {
      const adapter = adapterRef.current
      if (!adapter) throw new Error('Pad not ready')
      const sig = await adapter.complete()
      const res = await fetch(`/api/sign-capture/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ink_data: sig.inkData }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message || 'Submit failed')
      }
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function clear() {
    await adapterRef.current?.cancel()
    await adapterRef.current?.startCapture()
    setError('')
  }

  async function onImport(file: File | undefined) {
    if (!file || !adapterRef.current) return
    setError('')
    try {
      await adapterRef.current.loadFromImageFile(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="sign-pad-page">
      <header>
        <h1>rDMS-HQ sign</h1>
        <p className="muted">
          Draw with your finger, or import a signature image from Photos (including one you saved from
          Apple Markup). Apple’s built-in Markup signer cannot be opened from a website.
        </p>
      </header>
      {done ? (
        <p className="sign-pad-done">Signature sent. You can close this page and return to your computer.</p>
      ) : (
        <>
          <canvas ref={canvasRef} className="sign-pad-canvas" />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sign-pad-file"
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
          <div className="sign-pad-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!ready || submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Sending…' : 'Submit signature'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!ready}
              onClick={() => fileRef.current?.click()}
            >
              Import from Photos
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void clear()}>
              Clear
            </button>
          </div>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  )
}
