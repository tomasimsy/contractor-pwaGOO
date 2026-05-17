"use client";

import { softDeleteEstimate, softDeleteInvoice, softDeleteClient } from "@/lib/utils/softDelete";

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  deleting: boolean;
  type: "estimate" | "invoice" | "client";
  id: string;
}

export default function DeleteModal({ 
  isOpen, 
  onClose, 
  title, 
  message, 
  deleting, 
  type,
  id,
  onConfirm
}: DeleteModalProps) {
  if (!isOpen) return null;

  const handleDelete = async () => {
    try {
      if (type === "estimate") await softDeleteEstimate(id);
      if (type === "invoice") await softDeleteInvoice(id);
      if (type === "client") await softDeleteClient(id);
      onConfirm(); // Call the parent's onConfirm to refresh the list
    } catch (error) {
      alert("Error deleting");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="font-bold text-lg mb-2 text-navy">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}