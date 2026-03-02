import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { clearDeleteThreadError, requestDeleteThread, useThreadStoreSnapshot } from '@/thread/thread-store'

type ThreadDeleteDialogProps = {
  open: boolean
  onOpenChange: (next: boolean) => void
  projectId: string
  threadId: string
  threadTitle: string
}

function targetKey(projectId: string, threadId: string): string {
  return `${projectId}:${threadId}`
}

export function ThreadDeleteDialog({ open, onOpenChange, projectId, threadId, threadTitle }: ThreadDeleteDialogProps) {
  const snapshot = useThreadStoreSnapshot()
  const [pendingForceConfirm, setPendingForceConfirm] = useState(false)
  const key = targetKey(projectId, threadId)

  const deleteState = snapshot.delete
  const isTargetDelete = deleteState.targetThreadKey === key
  const requiresDirtyConfirm = isTargetDelete && deleteState.requiresDirtyConfirm
  const inlineError = isTargetDelete ? deleteState.error : null

  useEffect(() => {
    if (!open) {
      setPendingForceConfirm(false)
      clearDeleteThreadError()
      return
    }

    if (!snapshot.delete.pending && !requiresDirtyConfirm && !inlineError && isTargetDelete) {
      onOpenChange(false)
      setPendingForceConfirm(false)
      clearDeleteThreadError()
    }
  }, [open, snapshot.delete.pending, requiresDirtyConfirm, inlineError, isTargetDelete, onOpenChange])

  useEffect(() => {
    if (!requiresDirtyConfirm) {
      setPendingForceConfirm(false)
    }
  }, [requiresDirtyConfirm])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Thread</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingForceConfirm
              ? `Uncommitted changes were detected in "${threadTitle}". Confirm again to permanently delete this dirty worktree and stop its session.`
              : `Delete "${threadTitle}" and clean up its worktree, terminal session, and running agent.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requiresDirtyConfirm ? (
          <div className="rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {deleteState.dirtyReason ?? 'Worktree is dirty. Second confirmation required.'}
          </div>
        ) : null}

        {inlineError && !requiresDirtyConfirm ? (
          <div className="rounded-md border border-destructive/70 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {inlineError}
          </div>
        ) : null}

        <AlertDialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false)
              setPendingForceConfirm(false)
              clearDeleteThreadError()
            }}
            disabled={snapshot.delete.pending}
          >
            Cancel
          </Button>

          {requiresDirtyConfirm ? (
            <Button
              variant="destructive"
              onClick={() => {
                setPendingForceConfirm(true)
                requestDeleteThread(projectId, threadId, true)
              }}
              disabled={snapshot.delete.pending}
            >
              {snapshot.delete.pending ? 'Deleting…' : 'Delete Anyway'}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => {
                requestDeleteThread(projectId, threadId, false)
              }}
              disabled={snapshot.delete.pending}
            >
              {snapshot.delete.pending ? 'Deleting…' : 'Delete Thread'}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
