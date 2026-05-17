"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils/formatting";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (amount: number, method: string) => Promise<void>;
  remainingBalance: number;
  saving: boolean;
}

export default function PaymentModal({ 
  isOpen, 
  onClose, 
  onSave, 
  remainingBalance, 
  saving 
}: PaymentModalProps) {
  const [amount, setAmount] = useState(remainingBalance);
  const [method, setMethod] = useState("cash");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="font-bold text-lg mb-4">Record Payment</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <div className="flex gap-2 mb-2">
              <button 
                onClick={() => setAmount(remainingBalance)} 
                className="px-3 py-1 bg-gray-100 rounded text-sm"
              >
                Full
              </button>
              <button 
                onClick={() => setAmount(remainingBalance / 2)} 
                className="px-3 py-1 bg-gray-100 rounded text-sm"
              >
                50%
              </button>
              <button 
                onClick={() => setAmount(remainingBalance * 0.25)} 
                className="px-3 py-1 bg-gray-100 rounded text-sm"
              >
                25%
              </button>
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full border rounded-lg p-3 text-lg"
              step="0.01"
              placeholder="0.00"
            />
            <div className="text-xs text-gray-500 mt-1">
              Remaining: {formatCurrency(remainingBalance)}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border rounded-lg p-3"
            >
              <option value="cash">Cash</option>
              <option value="card">Credit/Debit Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="check">Check</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 border rounded-lg">
            Cancel
          </button>
          <button 
            onClick={() => onSave(amount, method)} 
            disabled={saving || amount <= 0}
            className="flex-1 py-2 bg-green-500 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? "Processing..." : `Record ${formatCurrency(amount)}`}
          </button>
        </div>
      </div>
    </div>
  );
}