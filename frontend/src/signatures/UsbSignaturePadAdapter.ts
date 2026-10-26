import type { NormalizedSignature, SignatureCaptureSource, StrokeHandler } from './types'
import { PointerTrackpadAdapter } from './PointerTrackpadAdapter'

/**
 * Primary adapter for USB pen signature pads.
 * Detects WebHID digitizer-like devices when available; falls back to
 * pointer events on the same canvas when the vendor SDK/WebHID path
 * is not yet bound — keep this class as the install point for a dedicated pad SDK.
 */
export class UsbSignaturePadAdapter implements SignatureCaptureSource {
  readonly id = 'usb_pad' as const
  private pointer = new PointerTrackpadAdapter()
  private deviceName: string | null = null

  attachCanvas(canvas: HTMLCanvasElement) {
    this.pointer.attachCanvas(canvas)
  }

  async detectAvailability(): Promise<boolean> {
    const nav = navigator as Navigator & {
      hid?: { getDevices: () => Promise<Array<{ productName?: string }>> }
    }
    if (!nav.hid) return false
    try {
      const devices = await nav.hid.getDevices()
      const pad = devices.find((d) =>
        /sign|wacom|topaz|scriptel|pad|digitizer/i.test(d.productName || ''),
      )
      if (pad) {
        this.deviceName = pad.productName || 'USB signature pad'
        return true
      }
    } catch {
      return false
    }
    return false
  }

  async startCapture(onStroke?: StrokeHandler): Promise<void> {
    // Future: open HID/vendor stream here and map strokes.
    // Until a pad SDK is installed, reuse canvas stroke capture with usb_pad source tagging.
    await this.pointer.startCapture(onStroke)
  }

  async complete(): Promise<NormalizedSignature> {
    const base = await this.pointer.complete()
    return {
      ...base,
      captureSource: 'usb_pad',
      deviceMetadata: {
        ...(base.deviceMetadata || {}),
        deviceName: this.deviceName || 'usb_pad_pending_sdk',
        adapter: 'UsbSignaturePadAdapter',
      },
    }
  }

  async cancel(): Promise<void> {
    await this.pointer.cancel()
  }

  dispose(): void {
    this.pointer.dispose()
  }
}
