import { api } from '../api/client'
import { publicCaptureOrigin } from './publicOrigin'
import type { NormalizedSignature, SignatureCaptureSource, StrokeHandler } from './types'

type StatusPayload = { status: string; ink_data?: string }

/**
 * Starts a short-lived capture session; iPhone opens /sign-pad/:token
 * and posts ink back. Desktop polls until completed.
 */
export class IPhoneCaptureAdapter implements SignatureCaptureSource {
  readonly id = 'iphone' as const
  private token: string | null = null
  private pollTimer: number | null = null
  private ink: string | null = null
  private waiters: Array<{ resolve: () => void; reject: (e: Error) => void }> = []
  public captureUrl: string | null = null
  public onInk?: (ink: string) => void
  public onStatus?: (status: string) => void

  async detectAvailability(): Promise<boolean> {
    return true
  }

  /** Creates session and begins polling. Resolves immediately with the phone URL. */
  async startCapture(_onStroke?: StrokeHandler): Promise<void> {
    this.clearPoll()
    this.ink = null
    this.token = null
    this.captureUrl = null

    const session = await api<{ token: string; capture_path: string }>('/signature/iphone-session', {
      method: 'POST',
    })
    this.token = session.token
    this.captureUrl = `${publicCaptureOrigin()}${session.capture_path}`
    this.onStatus?.('pending')

    this.pollTimer = window.setInterval(() => {
      void this.pollOnce()
    }, 1200)
  }

  /** Resolves when the phone has submitted ink (or rejects on expiry). */
  waitForInk(): Promise<void> {
    if (this.ink) return Promise.resolve()
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject })
    })
  }

  async complete(): Promise<NormalizedSignature> {
    if (!this.ink) {
      await this.waitForInk()
    }
    if (!this.ink) throw new Error('iPhone signature not ready')
    return {
      inkData: this.ink,
      captureSource: 'iphone',
      deviceMetadata: { channel: 'paired_session' },
    }
  }

  async cancel(): Promise<void> {
    this.rejectWaiters(new Error('Cancelled'))
    this.clearPoll()
    this.ink = null
    this.token = null
    this.captureUrl = null
  }

  dispose(): void {
    this.rejectWaiters(new Error('Disposed'))
    this.clearPoll()
  }

  private async pollOnce() {
    if (!this.token) return
    try {
      const status = (await fetch(`/api/sign-capture/${this.token}`, {
        headers: { Accept: 'application/json' },
      }).then((r) => {
        if (!r.ok) throw new Error('Could not check iPhone session')
        return r.json()
      })) as StatusPayload

      this.onStatus?.(status.status)

      if (status.status === 'completed' && status.ink_data) {
        this.ink = status.ink_data
        this.clearPoll()
        this.onInk?.(status.ink_data)
        this.resolveWaiters()
      } else if (status.status === 'expired') {
        this.clearPoll()
        this.rejectWaiters(new Error('iPhone capture session expired'))
      }
    } catch (e) {
      // Keep polling through transient network blips; only fail waiters on expiry.
      console.warn('iPhone session poll', e)
    }
  }

  private resolveWaiters() {
    const list = this.waiters
    this.waiters = []
    list.forEach((w) => w.resolve())
  }

  private rejectWaiters(err: Error) {
    const list = this.waiters
    this.waiters = []
    list.forEach((w) => w.reject(err))
  }

  private clearPoll() {
    if (this.pollTimer) window.clearInterval(this.pollTimer)
    this.pollTimer = null
  }
}
