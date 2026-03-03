'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const labelVariants = cva(
  'flex items-center gap-2 leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'text-xs/relaxed font-medium',
        muted: 'text-xs text-muted-foreground font-normal',
        heading: 'text-sm font-semibold text-foreground',
        caption: 'text-xs uppercase tracking-wide text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Label({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'label'> & VariantProps<typeof labelVariants>) {
  return <label data-slot="label" className={cn(labelVariants({ variant }), className)} {...props} />
}

export { Label, labelVariants }
