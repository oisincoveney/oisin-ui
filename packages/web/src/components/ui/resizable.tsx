import { GripVertical } from "lucide-react"
import {
  Group,
  Panel,
  Separator,
  type GroupProps,
  type SeparatorProps,
} from "react-resizable-panels"

import { cn } from "@/lib/utils"

type ResizablePanelGroupProps = Omit<GroupProps, "orientation"> & {
  direction?: "horizontal" | "vertical"
}

const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  ...props
}: ResizablePanelGroupProps) => (
  <Group
    orientation={direction}
    className={cn(
      "flex h-full w-full data-[group-orientation=vertical]:flex-col",
      className
    )}
    {...props}
  />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: SeparatorProps & {
  withHandle?: boolean
}) => (
  <Separator
    className={cn(
      "relative flex w-px items-center justify-center bg-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 data-[group-orientation=vertical]:h-px data-[group-orientation=vertical]:w-full",
      className
    )}
    {...props}
  >
    {withHandle ? (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    ) : null}
  </Separator>
)

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
