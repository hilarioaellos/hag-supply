"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function Modal({ open, onClose, children, title }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-hag-bg rounded-xl shadow-xl p-6 w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h2 className="text-lg font-700 text-hag-text mb-4">{title}</h2>
        )}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-hag-text-3 hover:text-hag-text"
          aria-label="Close"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
