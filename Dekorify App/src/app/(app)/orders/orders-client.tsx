"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Truck } from "lucide-react";
import { syncTrackingAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function SyncTrackingButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={compact ? "secondary" : "primary"}
      size={compact ? "sm" : "md"}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncTrackingAction();
          toast({
            title: result.ok ? "Tracking updated" : "Sync had problems",
            description: result.message,
            variant: result.ok ? "success" : "error",
          });
          router.refresh();
        })
      }
    >
      <RefreshCw className="h-4 w-4" aria-hidden />
      Sync tracking
    </Button>
  );
}

export function BookShipmentButton({
  orderId,
  disabled,
  reason,
}: {
  orderId: string;
  disabled?: boolean;
  reason?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        loading={pending}
        disabled={disabled}
        title={disabled ? reason : undefined}
        onClick={() =>
          startTransition(async () => {
            const { bookShipmentAction } = await import("@/app/actions/orders");
            const result = await bookShipmentAction(orderId);
            setFailed(result.ok ? null : result.message);
            toast({
              title: result.ok ? "Shipment booked" : "Could not book",
              description: result.message,
              variant: result.ok ? "success" : "error",
            });
            if (result.ok) router.refresh();
          })
        }
      >
        <Truck className="h-4 w-4" aria-hidden />
        Book with Leopards
      </Button>

      {(failed || (disabled && reason)) && (
        <p className="text-[12px] leading-relaxed text-negative">{failed ?? reason}</p>
      )}
    </div>
  );
}
