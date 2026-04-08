import { useRef, useCallback, useEffect, useState } from "react";
import { ArrowUp, Square, Paperclip, X, Loader2 } from "lucide-react";
import { cn, Textarea } from "@semlayer/ui";

export interface UploadedFile {
  filename: string;
  size: number;
  mimeType: string;
}

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  hasMessages: boolean;
  focusRequestId?: number;
  onFileUpload?: (file: File) => Promise<UploadedFile>;
  uploadedFiles?: UploadedFile[];
  onRemoveFile?: (filename: string) => void;
  isUploading?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  hasMessages,
  focusRequestId,
  onFileUpload,
  uploadedFiles = [],
  onRemoveFile,
  isUploading,
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

  const canSend = (value.trim() || uploadedFiles.length > 0) && !isStreaming;

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
            placeholder="Ask about your database or describe a semantic model..."
            disabled={isStreaming}
            rows={1}
            className="min-h-[80px] max-h-[50vh] resize-none rounded-[inherit] border-0 bg-transparent pb-12 shadow-none focus-visible:ring-0 overflow-y-auto text-base md:text-sm"
          />
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
