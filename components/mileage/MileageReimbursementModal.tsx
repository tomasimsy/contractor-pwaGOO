'use client';

import React from 'react';
import { X, Info, Fuel, Car, Wrench, ShieldCheck } from 'lucide-react';

interface MileageReimbursementModalProps {
  isOpen: boolean;
  onClose: () => void;
  rate: number; // current mileage rate (e.g., 0.70)
}

export function MileageReimbursementModal({ isOpen, onClose, rate }: MileageReimbursementModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal */}
        <div
          className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info size={20} className="text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-800">Mileage Reimbursement</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition"
              aria-label="Close"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 text-sm text-gray-700">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
              <div className="flex items-center gap-2 text-blue-700 font-semibold">
                <Fuel size={18} />
                <span>Standard Mileage Rate</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-blue-600">
                ${rate.toFixed(2)} <span className="text-sm font-normal text-gray-500">per mile</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-gray-800">How it works:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>
                  <strong>Reimbursement = Distance (miles) × Mileage Rate</strong>
                  <br />
                  <span className="text-xs text-gray-400">
                    Example: 50 miles × ${rate.toFixed(2)} = ${(50 * rate).toFixed(2)}
                  </span>
                </li>
                <li>The rate covers <strong>gas, maintenance, insurance, and depreciation</strong> – not just fuel.</li>
                <li>Your trips are automatically logged with GPS and routed via OpenRouteService.</li>
                <li>The rate is configurable (currently set to ${rate.toFixed(2)}).</li>
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-3 text-center text-xs text-gray-500">
              <div className="flex flex-col items-center">
                <Car size={16} className="text-gray-400 mb-1" />
                <span>Wear &amp; tear</span>
              </div>
              <div className="flex flex-col items-center">
                <Wrench size={16} className="text-gray-400 mb-1" />
                <span>Maintenance</span>
              </div>
              <div className="flex flex-col items-center">
                <ShieldCheck size={16} className="text-gray-400 mb-1" />
                <span>Insurance</span>
              </div>
            </div>

            <p className="text-xs text-gray-400 border-t border-gray-100 pt-3 mt-2">
              This method follows the standard IRS business mileage rate for reimbursement. Your mileage logs are secure and stored offline-first.
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
            <button
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  );
}