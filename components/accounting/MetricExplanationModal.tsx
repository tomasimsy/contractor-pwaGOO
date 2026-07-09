'use client';

import { X } from 'lucide-react';

interface MetricExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MetricExplanationModal({ isOpen, onClose }: MetricExplanationModalProps) {
  if (!isOpen) return null;

  const metrics = [
    {
      label: 'Total Revenue',
      description:
        'The sum of all estimate totals plus approved change orders. This is your total billed amount for completed work.',
    },
    {
      label: 'Total Expenses',
      description:
        'The sum of all costs: Subcontractor Paid + Agent Paid + Other Expenses. This is your total cash outlay for the job.',
    },
    {
      label: 'Company Profit',
      description:
        'Total Revenue minus Total Expenses. This is your net profit before taxes and overhead.',
    },
    {
      label: 'Remaining Balance',
      description:
        'Total Revenue minus Payments Received. This is the amount still owed by the client.',
    },
    {
      label: 'Payments Received',
      description:
        'The total amount you have collected from invoices with status "paid" or "partial".',
    },
    {
      label: 'Subcontractor Paid',
      description:
        'Total payments made to subcontractors for this estimate (via subcontractor_payments).',
    },
    {
      label: 'Agent Paid',
      description:
        'Total commissions or fees paid to agents for this estimate (via agent_payments).',
    },
    {
      label: 'Other Expenses',
      description:
        'Direct job costs such as materials, equipment rentals, permits, supplies, etc. (from estimate_expenses).',
    },
    {
      label: 'Mileage Deduction',
      description:
        'Total miles logged (YTD) multiplied by the IRS standard rate ($0.655/mile). This is a tax deduction for business driving.',
    },
    {
      label: 'Unsold Costs',
      description:
        'Sum of expenses from estimates that are still in Draft, Sent, or Rejected status. These are costs you incurred but did not recover.',
    },
    {
      label: 'Open Invoices',
      description:
        'Total amount of unpaid invoices (invoices not fully paid). This is your accounts receivable.',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Metric Explanations</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {metrics.map((metric) => (
            <div key={metric.label} className="border-b border-gray-100 pb-3 last:border-0">
              <h3 className="text-sm font-medium text-gray-800">{metric.label}</h3>
              <p className="text-sm text-gray-600 mt-1">{metric.description}</p>
            </div>
          ))}
        </div>
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}