import * as React from 'react'

type CollapsibleContextValue = {
  open: boolean
  setOpen: (next: boolean) => void
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null)

function useCollapsibleContext(): CollapsibleContextValue {
  const context = React.useContext(CollapsibleContext)
  if (!context) {
    throw new Error('Collapsible components must be used within Collapsible')
  }
  return context
}

type CollapsibleProps = React.PropsWithChildren<{
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}>

export function Collapsible({
  open,
  defaultOpen = false,
  onOpenChange,
  className,
  children,
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const isControlled = typeof open === 'boolean'
  const resolvedOpen = isControlled ? open : uncontrolledOpen

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next)
      }
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  return (
    <CollapsibleContext.Provider value={{ open: resolvedOpen, setOpen }}>
      <div className={className}>{children}</div>
    </CollapsibleContext.Provider>
  )
}

type CollapsibleTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement>

export const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, CollapsibleTriggerProps>(
  ({ onClick, ...props }, ref) => {
    const { open, setOpen } = useCollapsibleContext()
    return (
      <button
        ref={ref}
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) {
            setOpen(!open)
          }
        }}
        {...props}
      />
    )
  }
)
CollapsibleTrigger.displayName = 'CollapsibleTrigger'

type CollapsibleContentProps = React.HTMLAttributes<HTMLDivElement>

export const CollapsibleContent = React.forwardRef<HTMLDivElement, CollapsibleContentProps>(
  ({ children, ...props }, ref) => {
    const { open } = useCollapsibleContext()
    if (!open) {
      return null
    }
    return (
      <div ref={ref} {...props}>
        {children}
      </div>
    )
  }
)
CollapsibleContent.displayName = 'CollapsibleContent'
