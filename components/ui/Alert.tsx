"use client";

import { ReactNode, useState } from "react";

type AlertVariant = "info" | "warning" | "error" | "success";

const styles: Record<AlertVariant, string> = {
  info:    "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  success: "bg-emerald-50 border-emerald-200 text-emerald-800",
};

const icons: Record<AlertVariant, string> = {
  info:    "ℹ",
  warning: "⚠",
  error:   "✕",
  success: "✓",
};

interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  dismissible?: boolean;
}

export function Alert({ variant = "info", children, dismissible }: AlertProps) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles[variant]}`}>
      <span className="mt-0.5 font-700">{icons[variant]}</span>
      <span className="flex-1">{children}</span>
      {dismissible && (
        <button onClick={() => setClosed(true)} className="opacity-60 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}
