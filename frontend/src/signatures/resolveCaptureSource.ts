import { IPhoneCaptureAdapter } from './IPhoneCaptureAdapter'
import { PointerTrackpadAdapter } from './PointerTrackpadAdapter'
import type { CaptureSourceId, SignatureCaptureSource } from './types'
import { UsbSignaturePadAdapter } from './UsbSignaturePadAdapter'

export async function resolveCaptureSource(
  preferred: CaptureSourceId = 'pointer',
  canvas?: HTMLCanvasElement,
): Promise<SignatureCaptureSource> {
  if (preferred === 'iphone') {
    return new IPhoneCaptureAdapter()
  }

  if (preferred === 'usb_pad') {
    const usb = new UsbSignaturePadAdapter()
    if (canvas) usb.attachCanvas(canvas)
    return usb
  }

  const usb = new UsbSignaturePadAdapter()
  if (canvas) usb.attachCanvas(canvas)
  if (await usb.detectAvailability()) {
    return usb
  }

  return new PointerTrackpadAdapter(canvas)
}

export function listCaptureOptions(): { id: CaptureSourceId; label: string }[] {
  return [
    { id: 'usb_pad', label: 'USB signature pad' },
    { id: 'iphone', label: 'iPhone screen' },
    { id: 'pointer', label: 'Mouse / trackpad' },
  ]
}
