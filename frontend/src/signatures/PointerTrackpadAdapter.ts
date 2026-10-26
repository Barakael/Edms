import type { NormalizedSignature, SignatureCaptureSource, StrokeHandler } from './types'

export class PointerTrackpadAdapter implements SignatureCaptureSource {
  readonly id = 'pointer' as const
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private drawing = false
  private onStroke: StrokeHandler | undefined
  private hasInk = false

  constructor(canvas?: HTMLCanvasElement) {
    if (canvas) this.attachCanvas(canvas)
  }

  attachCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    if (this.ctx) {
      this.ctx.strokeStyle = '#1b3a5c'
      this.ctx.lineWidth = 2.2
      this.ctx.lineCap = 'round'
      this.ctx.lineJoin = 'round'
    }
  }

  async detectAvailability(): Promise<boolean> {
    return typeof window !== 'undefined'
  }

  async startCapture(onStroke?: StrokeHandler): Promise<void> {
    this.onStroke = onStroke
    this.hasInk = false
    if (!this.canvas || !this.ctx) throw new Error('Canvas not attached')
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.canvas.onpointerdown = (e) => {
      this.drawing = true
      this.ctx?.beginPath()
      this.ctx?.moveTo(e.offsetX, e.offsetY)
      this.canvas?.setPointerCapture(e.pointerId)
    }
    this.canvas.onpointermove = (e) => {
      if (!this.drawing || !this.ctx) return
      this.ctx.lineTo(e.offsetX, e.offsetY)
      this.ctx.stroke()
      this.hasInk = true
      this.onStroke?.({ x: e.offsetX, y: e.offsetY, pressure: e.pressure })
    }
    this.canvas.onpointerup = () => {
      this.drawing = false
    }
  }

  async complete(): Promise<NormalizedSignature> {
    if (!this.canvas || !this.hasInk) throw new Error('No signature captured')
    return {
      inkData: this.canvas.toDataURL('image/png'),
      captureSource: 'pointer',
      deviceMetadata: { input: 'mouse_or_trackpad' },
    }
  }

  async cancel(): Promise<void> {
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
    this.hasInk = false
  }

  /** Load a signature image (e.g. Photos export of an Apple Markup signature). */
  async loadFromImageFile(file: File): Promise<void> {
    if (!this.canvas || !this.ctx) throw new Error('Canvas not attached')
    if (!file.type.startsWith('image/')) throw new Error('Choose an image of your signature')

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Could not read image'))
      reader.readAsDataURL(file)
    })

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Invalid image'))
      el.src = dataUrl
    })

    const canvas = this.canvas
    const ctx = this.ctx
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const pad = 12
    const maxW = canvas.width - pad * 2
    const maxH = canvas.height - pad * 2
    const scale = Math.min(maxW / img.width, maxH / img.height, 1)
    const w = img.width * scale
    const h = img.height * scale
    const x = (canvas.width - w) / 2
    const y = (canvas.height - h) / 2
    ctx.drawImage(img, x, y, w, h)
    this.hasInk = true
  }

  dispose(): void {
    if (this.canvas) {
      this.canvas.onpointerdown = null
      this.canvas.onpointermove = null
      this.canvas.onpointerup = null
    }
  }
}
