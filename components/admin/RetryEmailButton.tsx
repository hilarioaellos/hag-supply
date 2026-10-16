"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const LABEL: Record<string, string> = {
  sent: "Sent",
  retry: "Failed again — will retry automatically",
  failed: "Failed",
  not_configured: "Email provider not configured",
  skipped: "Already being sent",
  deferred: "Requeued — will be sent shortly",
};

// Si el último intento terminó por timeout, el proveedor pudo haberlo aceptado igual: FAILED no prueba que no
// saliera. Se pide confirmación para que el operador revise Resend antes de reenviar.
export function RetryEmailButton({ emailId, timedOut = false }: { emailId: string; timedOut?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    if (
      timedOut &&
      !window.confirm(
        "The last attempt timed out, so the email provider may have delivered it anyway.\n\nCheck the email in Resend first. Retry anyway?"
      )
    )
      return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/email-outbox/${emailId}/retry`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? LABEL[data.delivery] ?? "Requeued" : data.error ?? "Could not retry");
      router.refresh();
    } catch {
      setMessage("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" loading={loading} disabled={loading} onClick={retry}>
        Retry
      </Button>
      {message && <span className="text-[11px] text-hag-text-2 text-right">{message}</span>}
    </div>
  );
}
