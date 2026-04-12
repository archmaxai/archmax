import { useRef, useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowUp, Square, Paperclip, X, Loader2, ChevronDown } from "lucide-react";
import { cn, Textarea } from "@archmax/ui";

export interface UploadedFile {
  filename: string;
  size: number;
  mimeType: string;
}

export interface InputPillOption {
  id: string;
  label: string;
  detail?: string;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  hasMessages: boolean;
  focusRequestId?: number;
  placeholder?: string;
  onFileUpload?: (file: File) => Promise<UploadedFile>;
  uploadedFiles?: UploadedFile[];
  onRemoveFile?: (filename: string) => void;
  isUploading?: boolean;
  /** Render pills (dropdowns) in the bottom-left of the input, like Cursor's "Agent" / model selectors */
  bottomLeft?: ReactNode;
  /** Disable send (greys out textarea + button) while still showing the input */
  disableSend?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  hasMessages,
  focusRequestId,
  placeholder,
  onFileUpload,
  uploadedFiles = [],
  onRemoveFile,
  isUploading,
  bottomLeft,
  disableSend,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!focusRequestId) return;
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      try {
        el.setSelectionRange(el.value.length, el.value.length);
      } catch {
        // ignore selection errors
      }
    }, 0);
  }, [focusRequestId]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function handleFileSelect(files: FileList | null) {
    if (!files || !onFileUpload) return;
    for (const file of Array.from(files)) {
      onFileUpload(file);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }

  const canSend = (value.trim() || uploadedFiles.length > 0) && !isStreaming && !disableSend;

  return (
    <div
      className="relative z-10 px-4 pt-5 pb-4 lg:px-8"
      style={
        hasMessages
          ? {
              background: "var(--frosted-bg)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }
          : undefined
      }
    >
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            "input-focus-within relative rounded-lg border focus-within:ring-ring/50 focus-within:ring-[3px] bg-card dark:bg-[oklch(0.27_0_0)] transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-transparent",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {uploadedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-3">
              {uploadedFiles.map((f) => (
                <span
                  key={f.filename}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <Paperclip className="h-3 w-3" />
                  {f.filename}
                  {onRemoveFile && (
                    <button
                      type="button"
                      onClick={() => onRemoveFile(f.filename)}
                      className="ml-0.5 rounded-sm hover:text-foreground transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Describe the semantic model you want to build and how it relates to your data..."}
            disabled={isStreaming || disableSend}
            rows={1}
            className="min-h-[80px] max-h-[50vh] resize-none rounded-[inherit] border-0 bg-transparent pb-12 shadow-none focus-visible:ring-0 overflow-y-auto text-base md:text-sm"
          />

          {bottomLeft && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1">
              {bottomLeft}
            </div>
          )}

          <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
            {onFileUpload && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || isUploading}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                    isUploading
                      ? "text-muted-foreground cursor-not-allowed"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                  title="Upload document"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.html,.htm,.json,.xml"
                  onChange={(e) => {
                    handleFileSelect(e.target.files);
                    e.target.value = "";
                  }}
                />
              </>
            )}
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-foreground/90"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!canSend}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                  canSend
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A pill-shaped dropdown selector for the bottom-left of ChatInput.
 * Mimics Cursor's "Agent" / model selector pills.
 */
export function InputPill({
  options,
  value,
  onChange,
  placeholder = "Select...",
  emptyLabel = "No options available",
}: {
  options: InputPillOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
          selected
            ? "bg-muted text-foreground hover:bg-muted/80"
            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="max-w-[140px] truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50 min-w-[280px] max-w-[360px] rounded-xl bg-popover p-1.5 shadow-popup">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm transition-colors",
                opt.id === value
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50",
              )}
            >
              <span className="font-medium truncate w-full">{opt.label}</span>
              {opt.detail && (
                <span className="text-xs text-muted-foreground truncate w-full">{opt.detail}</span>
              )}
            </button>
          ))}
          {options.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground text-center">{emptyLabel}</p>
          )}
        </div>
      )}
    </div>
  );
}
