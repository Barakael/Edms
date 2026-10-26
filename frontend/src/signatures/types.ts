export type CaptureSourceId = 'usb_pad' | 'iphone' | 'pointer'

export type NormalizedSignature = {
  inkData: string
  captureSource: CaptureSourceId
  deviceMetadata?: Record<string, unknown>
}

export type StrokeHandler = (point: { x: number; y: number; pressure?: number }) => void

/**
 * Pluggable capture contract — USB pad, iPhone, pointer, and future vendors
 * implement this without changing save/place flows.
 */
export interface SignatureCaptureSource {
  readonly id: CaptureSourceId
  detectAvailability(): Promise<boolean>
  startCapture(onStroke?: StrokeHandler): Promise<void>
  complete(): Promise<NormalizedSignature>
  cancel(): Promise<void>
  dispose(): void
}
