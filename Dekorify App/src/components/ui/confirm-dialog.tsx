"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./button";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  tone = "danger",
  detail,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  detail?: React.ReactNode;
}) {
  const [working, setWorking] = useState(false);

  async function handleConfirm() {
    setWorking(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={working ? () => undefined : onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button variant={tone} onClick={handleConfirm} loading={working}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5">
        <div className="mt-0.5 shrink-0 rounded-full bg-negative-soft p-2">
          <AlertTriangle className="h-5 w-5 text-negative" aria-hidden />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm leading-relaxed text-muted-strong">{message}</p>
          {detail}
        </div>
      </div>
    </Modal>
  );
}

/** Small hook so list pages can wire up a delete confirmation in a few lines. */
export function useConfirm<T>() {
  const [target, setTarget] = useState<T | null>(null);
  return {
    target,
    isOpen: target !== null,
    ask: (value: T) => setTarget(value),
    close: () => setTarget(null),
  };
}
