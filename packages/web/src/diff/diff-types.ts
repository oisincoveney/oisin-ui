import type { ConnectionStatus } from '@/lib/ws'

export type CheckoutError = {
  code: string
  message: string
}

export type ParsedDiffToken = {
  text: string
  style: string | null
}

export type ParsedDiffLine = {
  type: 'add' | 'remove' | 'context' | 'header'
  content: string
  tokens?: ParsedDiffToken[]
}

export type ParsedDiffHunk = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: ParsedDiffLine[]
}

export type ParsedDiffFile = {
  path: string
  oldPath?: string
  isNew: boolean
  isDeleted: boolean
  additions: number
  deletions: number
  hunks: ParsedDiffHunk[]
  status?: 'ok' | 'too_large' | 'binary'
}

export type CheckoutDiffPayload = {
  subscriptionId: string
  cwd: string
  files: ParsedDiffFile[]
  stagedFiles: ParsedDiffFile[]
  unstagedFiles: ParsedDiffFile[]
  error: CheckoutError | null
}

export type DiffSessionMessage =
  | {
      type: 'subscribe_checkout_diff_response'
      payload: CheckoutDiffPayload & {
        requestId: string
      }
    }
  | {
      type: 'checkout_diff_update'
      payload: CheckoutDiffPayload
    }

export type ThreadDiffTarget = {
  projectId: string
  threadId: string
  threadKey: string
  cwd: string
}

export type DiffCacheEntry = {
  threadKey: string
  projectId: string
  threadId: string
  cwd: string
  files: ParsedDiffFile[]
  stagedFiles: ParsedDiffFile[]
  unstagedFiles: ParsedDiffFile[]
  error: string | null
  updatedAt: string
}

export type DiffPanelState = {
  isOpen: boolean
  widthPercent: number
}

export type DiffStoreState = {
  connectionStatus: ConnectionStatus
  activeTarget: ThreadDiffTarget | null
  activeSubscriptionId: string | null
  activeRequestId: string | null
  loading: boolean
  error: string | null
  panel: DiffPanelState
  cacheByThreadKey: Record<string, DiffCacheEntry>
}
