import React from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface LineItem {
  id: string | number;
  type: 'addition' | 'deduction';
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface ChangeOrderModalProps {
  existingOrder: any;
  onClose: () => void;
  title: string;
  setTitle: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  lineItems: LineItem[];
  addLineItem: () => void;
  removeLineItem: (id: string | number) => void;
  updateLineItem: (id: string | number, field: keyof LineItem, value: any) => void;
  estimateTotal: number;
  calculateTotalChange: () => number;
  revisedTotal: number;
  formatCurrency: (value: number) => string;
  handleSave: () => void;
  saving: boolean;
}

export default function ChangeOrderModal({
  existingOrder,
  onClose,
  title,
  setTitle,
  description,
  setDescription,
  lineItems,
  addLineItem,
  removeLineItem,
  updateLineItem,
  estimateTotal,
  calculateTotalChange,
  revisedTotal,
  formatCurrency,
  handleSave,
  saving,
}: ChangeOrderModalProps) {
  const totalChange = calculateTotalChange();

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-2xl">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">
              {existingOrder ? "Edit Change Order" : "New Change Order"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Adjust scope and financials for this project</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Title Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Title <span className="text-rose-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-800 font-medium"
              placeholder="e.g., Additional structural framing"
            />
          </div>

          {/* Description Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-600 min-h-[70px] max-h-[140px]"
              placeholder="Provide context or scope variations..."
            />
          </div>

          {/* Line Items Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Scope Adjustments</label>
              <button 
                onClick={addLineItem} 
                className="text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors group"
              >
                <Plus size={14} className="group-hover:scale-110 transition-transform" /> Add Scope Item
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-sm text-slate-400 font-medium">No items added yet. Click above to add adjustments.</p>
                </div>
              ) : (
                lineItems.map((item) => (
                  <div key={item.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm hover:border-slate-300 transition-all space-y-3 relative group">
                    
                    {/* Header Row of Single Line Item */}
                    <div className="flex gap-2 items-center justify-between">
                      <select
                        value={item.type}
                        onChange={(e) => updateLineItem(item.id, "type", e.target.value as any)}
                        className="text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 cursor-pointer"
                      >
                        <option value="addition">Add Scope</option>
                        <option value="deduction">Deduct Scope</option>
                      </select>
                      
                      <button 
                        onClick={() => removeLineItem(item.id)} 
                        className="text-slate-400 hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* Scope Item Input */}
                    <input
                      type="text"
                      placeholder="Item name / basic description"
                      value={item.description}
                      onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:outline-none focus:border-slate-400 text-slate-700 placeholder-slate-400 font-medium"
                    />

                    {/* Math Values Row */}
                    <div className="grid grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] font-medium text-slate-500 block mb-1">Qty</label>
                        <input
                          type="number"
                          value={item.quantity === 0 ? "" : item.quantity}
                          onChange={(e) => updateLineItem(item.id, "quantity", Number(e.target.value) || 0)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-slate-400"
                          step="1"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-slate-500 block mb-1">Unit Cost ($)</label>
                        <input
                          type="number"
                          value={item.unit_price === 0 ? "" : item.unit_price}
                          onChange={(e) => updateLineItem(item.id, "unit_price", Number(e.target.value) || 0)}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-slate-400"
                          step="0.01"
                          min="0"
                        />
                      </div>
                      <div className="text-right flex flex-col justify-end">
                        <label className="text-[11px] font-medium text-slate-400 block mb-1">Row Total</label>
                        <div className="text-sm font-semibold text-slate-800 py-1.5">
                          {formatCurrency(item.total)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Dynamic Financial Overview Summary Card */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 space-y-2.5">
            <div className="flex justify-between text-xs font-medium text-slate-500">
              <span>Original Base Estimate</span>
              <span>{formatCurrency(estimateTotal)}</span>
            </div>
            <div className="flex justify-between text-xs font-medium">
              <span className="text-slate-500">Net Scope Adjustments</span>
              <span className={totalChange >= 0 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                {totalChange >= 0 ? "+" : "-"} {formatCurrency(Math.abs(totalChange))}
              </span>
            </div>
            <div className="border-t border-slate-200/60 my-2 pt-2.5 flex justify-between items-baseline">
              <span className="text-sm font-bold text-slate-800">Revised Total Value</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(revisedTotal)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl flex gap-3">
          <button 
            type="button"
            onClick={onClose} 
            className="flex-1 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl text-sm transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={handleSave} 
            disabled={saving || !title.trim()} 
            className="flex-1 py-2.5 px-4 bg-slate-950 hover:bg-slate-800 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : existingOrder ? (
              "Update Change Order"
            ) : (
              "Create Change Order"
            )}
          </button>
        </div>

      </div>
    </div>
  );
}