import * as React from "react"
import { CalendarIcon, X } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { Calendar } from "./calendar"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export type { DateRange }

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatRange(range: DateRange | undefined): string | null {
  if (!range?.from) return null
  if (!range.to) return formatDate(range.from)
  return `${formatDate(range.from)} – ${formatDate(range.to)}`
}

interface DateRangePickerProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  align?: "start" | "center" | "end"
  numberOfMonths?: number
}

function DateRangePicker({
  value,
  onChange,
  placeholder = "Any date",
  className,
  align = "start",
  numberOfMonths = 2,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const label = formatRange(value)
  const hasValue = !!label

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-slot="date-range-picker-trigger"
            data-active={hasValue ? "true" : undefined}
            className={cn(
              "filter-trigger inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
              "hover:bg-foreground/[0.05]",
              hasValue ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-3.5" />
            <span>{label ?? placeholder}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-auto p-0" sideOffset={4}>
          <Calendar
            mode="range"
            numberOfMonths={numberOfMonths}
            selected={value}
            onSelect={(range) => onChange(range)}
            defaultMonth={value?.from}
          />
        </PopoverContent>
      </Popover>
      {hasValue ? (
        <button
          type="button"
          aria-label="Clear date range"
          title="Clear date range"
          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
          onClick={() => onChange(undefined)}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export { DateRangePicker }
