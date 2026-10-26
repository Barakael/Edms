import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { IPhoneCaptureAdapter } from '../signatures/IPhoneCaptureAdapter'
import { isLoopbackOrigin } from '../signatures/publicOrigin'
import { listCaptureOptions } from '../signatures/resolveCaptureSource'
import type { CaptureSourceId, SignatureCaptureSource } from '../signatures/types'
import { PointerTrackpadAdapter } from '../signatures/PointerTrackpadAdapter'
import { UsbSignaturePadAdapter } from '../signatures/UsbSignaturePadAdapter'
import { StatusToast } from '../components/Toast'
import './SignaturePage.css'

export function SignaturePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const adapterRef = useRef<SignatureCaptureSource | null>(null)
  const { refreshMe } = useAuth()
  const [source, setSource] = useState<CaptureSourceId>('pointer')
  const [iphoneUrl, setIphoneUrl] = useState<string | null>(null)
  const [iphoneInk, setIphoneInk] = useState<string | null>(null)
  const [iphoneStatus, setIphoneStatus] = useState<'idle' | 'pending' | 'completed'>('idle')
  const [copied, setCopied] = useState(false)
  const [current, setCurrent] = useState<{ ink_data: string; capture_source: string } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ signature: { ink_data: string; capture_source: string } | null }>('/signature')
      .then((r) => setCurrent(r.signature))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    adapterRef.current?.dispose()
    setIphoneUrl(null)
    setIphoneInk(null)
    setIphoneStatus('idle')
    setError('')
    setMessage('')

    let adapter: SignatureCaptureSource
    if (source === 'usb_pad') {
      if (!canvas) return
      canvas.width = 560
      canvas.height = 200
      const usb = new UsbSignaturePadAdapter()
      usb.attachCanvas(canvas)
      adapter = usb
    } else if (source === 'iphone') {
      const phone = new IPhoneCaptureAdapter()
      phone.onInk = (ink) => {
        setIphoneInk(ink)
        setIphoneStatus('completed')
        setMessage('Signature received from iPhone — click Save.')
      }
      phone.onStatus = (s) => {
        if (s === 'pending') setIphoneStatus('pending')
        if (s === 'completed') setIphoneStatus('completed')
      }
      adapter = phone
    } else {
      if (!canvas) return
      canvas.width = 560
      canvas.height = 200
      adapter = new PointerTrackpadAdapter(canvas)
    }
    adapterRef.current = adapter

    void adapter
      .startCapture()
      .then(() => {
        if (adapter instanceof IPhoneCaptureAdapter) {
          setIphoneUrl(adapter.captureUrl)
          setIphoneStatus('pending')
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not start capture'))

    return () => adapter.dispose()
  }, [source])

  async function save() {
    setError('')
    setMessage('')
    try {
      const adapter = adapterRef.current
      if (!adapter) return
      const normalized = await adapter.complete()
      await api('/signature', {
        method: 'POST',
        body: JSON.stringify({
          ink_data: normalized.inkData,
          capture_source: normalized.captureSource,
          device_metadata: normalized.deviceMetadata,
        }),
      })
      setCurrent({ ink_data: normalized.inkData, capture_source: normalized.captureSource })
      setMessage('Signature saved.')
      await refreshMe()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function clearPad() {
    await adapterRef.current?.cancel()
    setIphoneInk(null)
    setMessage('')
    if (source === 'iphone') {
      // Restart a fresh phone session
      setSource('iphone')
      const phone = new IPhoneCaptureAdapter()
      phone.onInk = (ink) => {
        setIphoneInk(ink)
        setIphoneStatus('completed')
        setMessage('Signature received from iPhone — click Save.')
      }
      adapterRef.current?.dispose()
      adapterRef.current = phone
      void phone.startCapture().then(() => {
        setIphoneUrl(phone.captureUrl)
        setIphoneStatus('pending')
      })
    }
  }

  async function copyLink() {
    if (!iphoneUrl) return
    try {
      await navigator.clipboard.writeText(iphoneUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy link')
    }
  }

  const qrSrc = iphoneUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(iphoneUrl)}`
    : null
  const linkStillLocal = Boolean(iphoneUrl && isLoopbackOrigin(iphoneUrl))

  return (
    <div className="sig-page">
      <header className="sig-page-header">
        <h1>Your signature</h1>
        <p className="muted">
          Capture once, place on documents later. Sources share one interface — USB pad, iPhone, or
          mouse/trackpad.
        </p>
      </header>

      <div className="panel sig-panel">
        <div className="field">
          <label htmlFor="source">Capture source</label>
          <select id="source" value={source} onChange={(e) => setSource(e.target.value as CaptureSourceId)}>
            {listCaptureOptions().map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {source !== 'iphone' && (
          <canvas ref={canvasRef} className="sig-canvas" />
        )}

        {source === 'iphone' && (
          <div className="iphone-connect">
            {linkStillLocal && (
              <p className="iphone-hint">
                Could not detect a LAN IP automatically. Restart <code>npm run dev</code> (it listens on
                the network), or set <code>VITE_PUBLIC_ORIGIN=http://192.168.x.x:5173</code> in{' '}
                <code>frontend/.env</code> to your Mac’s Wi‑Fi address.
              </p>
            )}
            {iphoneUrl ? (
              <>
                <p className="muted">
                  Same Wi‑Fi required. Scan the QR or open this LAN link on your iPhone:
                </p>
                {qrSrc && (
                  <img className="iphone-qr" src={qrSrc} alt="QR code to open sign pad on iPhone" width={200} height={200} />
                )}
                <div className="iphone-link-row">
                  <a href={iphoneUrl} target="_blank" rel="noreferrer" className="iphone-link">
                    {iphoneUrl}
                  </a>
                  <button type="button" className="btn btn-secondary" onClick={() => void copyLink()}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className={`iphone-status${iphoneStatus === 'completed' ? ' is-ready' : ''}`}>
                  {iphoneStatus === 'completed'
                    ? 'Connected — signature received'
                    : 'Waiting for iPhone… keep this page open'}
                </p>
                {iphoneInk && (
                  <img src={iphoneInk} alt="Signature from iPhone" className="iphone-preview" />
                )}
              </>
            ) : (
              <p className="muted">Starting iPhone session…</p>
            )}
          </div>
        )}

        <div className="sig-actions">
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            Save signature
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void clearPad()}>
            Clear / new session
          </button>
        </div>
        <StatusToast error={error} success={message} />
        {message && <p className="sig-ok">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </div>

      {current && (
        <div className="panel sig-active">
          <h3>Active signature</h3>
          <p className="muted">Source: {current.capture_source}</p>
          <img src={current.ink_data} alt="Saved signature" className="sig-active-img" />
        </div>
      )}
    </div>
  )
}
