import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
} from "@archmax/ui";

const DISCLAIMER_ITEMS = [
  "Large semantic models can cost a significant number of tokens. The framework is based on long-running agents — monitor your LLM cost carefully.",
  "The semantic model builder agent can put substantial load on the source database system when exploring schemas. With data lakes or large tables, this may cause significant data scans. The agent tries to minimize this and will ask before running expensive operations, but cannot guarantee it.",
  "Schema metadata (table names, column names, sample data, distinct values) is sent to the configured LLM provider during model building. This may include personally identifiable information (PII) depending on the source data.",
  "AI-generated semantic models may contain inaccuracies and should be reviewed before use.",
] as const;

interface DisclaimerDialogProps {
  onAccept: () => void;
}

export function DisclaimerDialog({ onAccept }: DisclaimerDialogProps) {
  const [checked, setChecked] = useState(false);

  return (
    <Dialog open modal>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Before You Begin</DialogTitle>
          <DialogDescription>
            Please review and acknowledge the following before using archmax.
          </DialogDescription>
        </DialogHeader>

        <div className="content-group text-sm">
          <p className="font-medium">I understand that:</p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            {DISCLAIMER_ITEMS.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 size-4 rounded accent-primary shrink-0"
          />
          <span className="text-sm">
            I have read and understand the above statements
          </span>
        </label>

        <DialogFooter>
          <Button disabled={!checked} onClick={onAccept}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
