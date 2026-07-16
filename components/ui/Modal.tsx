"use client";

import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * Generic modal shell — same fixed/backdrop/card structure every
 * modal in this app already reimplements inline (see DeleteModal.tsx),
 * but presentation-only with no fixed button row, so callers compose
 * their own body/footer as children instead of being locked into a
 * confirm/cancel shape.
 */
export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3.5">
          <h3 className="text-[15px] font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 -m-1"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
