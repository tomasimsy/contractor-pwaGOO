"use client";

/** In-app replacement for window.confirm() and window.prompt(). The desktop
 * app does not support those browser dialogs, so every confirm and reason
 * prompt goes through this hook instead.
 *
 * Usage:
 *   const { ask, dialog } = useConfirmDialog();
 *   const reason = await ask({ title, message, reasonLabel: "Why?" });
 *   // render {dialog} once in the component's JSX
 *
 * ask() resolves to null when the user cancels. For a plain confirm it
 * resolves to "" on OK; with reasonLabel set it resolves to the trimmed
 * reason, and the OK button stays disabled until one is typed. */
import { useCallback, useState } from "react";
import { Modal } from "./Modal";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Use the danger style for destructive actions. */
  destructive?: boolean;
  /** Adds a required text box with this label. */
  reasonLabel?: string;
  /** Starting text for the text box. */
  reasonDefault?: string;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: string | null) => void;
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [reason, setReason] = useState("");

  const ask = useCallback(
    (options: ConfirmOptions) =>
      new Promise<string | null>((resolve) => {
        setReason(options.reasonDefault ?? "");
        setPending({ ...options, resolve });
      }),
    []
  );

  const close = useCallback(() => {
    pending?.resolve(null);
    setPending(null);
  }, [pending]);

  const confirm = useCallback(() => {
    if (!pending) return;
    if (pending.reasonLabel) {
      const trimmed = reason.trim();
      if (!trimmed) return;
      pending.resolve(trimmed);
    } else {
      pending.resolve("");
    }
    setPending(null);
  }, [pending, reason]);

  const dialog = (
    <Modal open={pending !== null} onClose={close} title={pending?.title}>
      {pending && (
        <div className="space-y-4">
          {pending.message && <p className="text-sm text-muted-foreground">{pending.message}</p>}
          {pending.reasonLabel && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">{pending.reasonLabel}</span>
              <input
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirm();
                }}
                className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!!pending.reasonLabel && !reason.trim()}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                pending.destructive ? "bg-danger text-danger-foreground" : "bg-primary text-primary-foreground"
              }`}
            >
              {pending.confirmLabel ?? "OK"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );

  return { ask, dialog };
}
