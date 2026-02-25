// @ts-nocheck
import { describe, expect, it } from 'bun:test'

async function loadRecoveryApi() {
  const globalWithWindow = globalThis as typeof globalThis & {
    window?: {
      location: {
        protocol: string
        hostname: string
      }
    }
  }

  if (!globalWithWindow.window) {
    globalWithWindow.window = {
      location: {
        protocol: 'http:',
        hostname: 'localhost',
      },
    }
  }

  return import('./App')
}

describe('attach recovery state machine', () => {
  it('retries within the 60 second window and transitions to failed at the deadline', async () => {
    const {
      ATTACH_RECOVERY_WINDOW_MS,
      createIdleAttachRecoveryState,
      nextAttachRecoveryRetryState,
    } = await loadRecoveryApi()
    const startedAt = 5_000
    const first = nextAttachRecoveryRetryState(createIdleAttachRecoveryState(), startedAt, 'Terminal not found')

    expect(first.phase).toBe('retrying')
    expect(first.attempt).toBe(1)
    expect(first.startedAt).toBe(startedAt)
    expect(first.deadlineAt).toBe(startedAt + ATTACH_RECOVERY_WINDOW_MS)
    expect(first.lastError).toBe('Terminal not found')

    const nearDeadline = nextAttachRecoveryRetryState(
      first,
      startedAt + ATTACH_RECOVERY_WINDOW_MS - 1,
      'Terminal not found'
    )
    expect(nearDeadline.phase).toBe('retrying')
    expect(nearDeadline.attempt).toBe(2)
    expect(nearDeadline.deadlineAt).toBe(startedAt + ATTACH_RECOVERY_WINDOW_MS)

    const atDeadline = nextAttachRecoveryRetryState(
      nearDeadline,
      startedAt + ATTACH_RECOVERY_WINDOW_MS,
      'Terminal not found'
    )
    expect(atDeadline.phase).toBe('failed')
    expect(atDeadline.attempt).toBe(3)
    expect(atDeadline.lastError).toBe('Terminal not found')
  })

  it('reports remaining retry window only while retrying', async () => {
    const {
      ATTACH_RECOVERY_WINDOW_MS,
      createIdleAttachRecoveryState,
      getAttachRecoveryRemainingMs,
      nextAttachRecoveryRetryState,
    } = await loadRecoveryApi()
    const startedAt = 100
    const retrying = nextAttachRecoveryRetryState(createIdleAttachRecoveryState(), startedAt, 'attach failed')

    expect(getAttachRecoveryRemainingMs(retrying, startedAt)).toBe(ATTACH_RECOVERY_WINDOW_MS)
    expect(getAttachRecoveryRemainingMs(retrying, startedAt + 40_000)).toBe(20_000)
    expect(getAttachRecoveryRemainingMs(retrying, startedAt + ATTACH_RECOVERY_WINDOW_MS + 1)).toBe(0)

    const idle = createIdleAttachRecoveryState(retrying.token)
    expect(getAttachRecoveryRemainingMs(idle, startedAt)).toBeNull()
  })

  it('clears retrying state and emits reconnect toast once per recovery token', async () => {
    const { createIdleAttachRecoveryState, nextAttachRecoveryRetryState, resolveAttachRecoverySuccess } =
      await loadRecoveryApi()
    const retrying = nextAttachRecoveryRetryState(createIdleAttachRecoveryState(), 0, 'Terminal not found')

    const firstSuccess = resolveAttachRecoverySuccess(retrying, null)
    expect(firstSuccess.nextState.phase).toBe('idle')
    expect(firstSuccess.emitToast).toBe(true)
    expect(firstSuccess.nextToastToken).toBe(retrying.token)

    const duplicateSuccess = resolveAttachRecoverySuccess(retrying, firstSuccess.nextToastToken)
    expect(duplicateSuccess.nextState.phase).toBe('idle')
    expect(duplicateSuccess.emitToast).toBe(false)
    expect(duplicateSuccess.nextToastToken).toBe(retrying.token)
  })
})
