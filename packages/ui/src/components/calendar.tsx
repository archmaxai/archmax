import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayPickerProps } from "react-day-picker"

import { cn } from "../lib/utils"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: DayPickerProps) {
  return (
    <DayPicker
      data-slot="calendar"
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-4",
        month: "flex flex-col gap-3",
        month_caption: "flex justify-center items-center h-8 relative",
        caption_label: "text-sm font-medium",
        nav: "absolute inset-x-0 flex items-center justify-between px-1",
        button_previous:
          "size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50",
        button_next:
          "size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground disabled:opacity-50",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "text-muted-foreground w-9 font-normal text-[0.7rem] uppercase tracking-wider",
        week: "flex w-full mt-1",
        day: "relative p-0 text-center text-sm size-9 [&:has([aria-selected])]:bg-transparent",
        day_button:
          "inline-flex size-9 items-center justify-center rounded-md text-sm font-normal transition-colors hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40",
        selected:
          "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today:
          "[&>button]:font-semibold [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-foreground/20",
        outside:
          "text-muted-foreground/50 [&>button]:text-muted-foreground/50",
        disabled: "text-muted-foreground/40",
        range_start:
          "[&>button]:bg-primary [&>button]:text-primary-foreground rounded-l-md",
        range_end:
          "[&>button]:bg-primary [&>button]:text-primary-foreground rounded-r-md",
        range_middle:
          "bg-primary/15 [&>button]:bg-transparent [&>button]:text-foreground [&>button]:hover:bg-primary/20",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      {...props}
    />
  )
}

export { Calendar }
