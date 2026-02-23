import * as React from 'react'
import { cn } from '@/lib/utils'

export function SidebarProvider({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex h-screen w-screen overflow-hidden', className)}>{children}</div>
}

export function Sidebar({ className, children }: React.HTMLAttributes<HTMLElement>) {
  return (
    <aside
      className={cn(
        'hidden h-full w-[320px] shrink-0 border-r border-border/70 bg-card/60 backdrop-blur md:flex md:flex-col',
        className
      )}
    >
      {children}
    </aside>
  )
}

export function SidebarHeader({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('border-b border-border/70 p-3', className)}>{children}</div>
}

export function SidebarContent({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex-1 overflow-y-auto p-2', className)}>{children}</div>
}

export function SidebarGroup({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn('space-y-2', className)}>{children}</section>
}

export function SidebarGroupLabel({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground', className)}>{children}</div>
}

export function SidebarGroupContent({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1', className)}>{children}</div>
}

export function SidebarMenu({ className, children }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('space-y-1', className)}>{children}</ul>
}

export function SidebarMenuItem({ className, children }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn('list-none', className)}>{children}</li>
}

type SidebarMenuButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, isActive = false, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-accent/70 hover:text-accent-foreground',
          isActive && 'bg-accent text-accent-foreground font-semibold',
          className
        )}
        {...props}
      />
    )
  }
)
SidebarMenuButton.displayName = 'SidebarMenuButton'

export function SidebarInset({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-w-0 flex-1 flex-col', className)}>{children}</div>
}
