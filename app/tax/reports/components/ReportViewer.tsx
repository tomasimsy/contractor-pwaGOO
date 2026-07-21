"use client";

import toast from "react-hot-toast";
import { Download, FileText } from "lucide-react";

export interface ReportData {
  title: string;
  subtitle?: string;
  sections: ReportSection[];
  notes?: string[];
}

export interface ReportSection {
  title: string;
  items: ReportItem[];
  subtotal?: { label: string; value: number };
}

export interface ReportItem {
  label: string;
  value: number;
  indent?: boolean;
  bold?: boolean;
  highlight?: boolean;
}

export function ReportViewer({ data, taxYear }: { data: ReportData; taxYear: number }) {
  const handleDownloadPDF = () => {
    // PDF export isn't built yet — say so instead of a button that
    // silently does nothing after a "Generating..." flash.
    toast("PDF export isn't available yet.", { icon: "📄" });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{data.title}</h1>
              {data.subtitle && <p className="text-sm text-slate-600 mt-1">{data.subtitle}</p>}
              <p className="text-sm text-slate-500 mt-2">For the Year Ended December 31, {taxYear}</p>
            </div>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              <Download size={16} />
              Download PDF
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        <div className="max-w-5xl mx-auto">
          <div className="space-y-8">
            {data.sections.map((section, idx) => (
              <div key={idx}>
                <h2 className="text-lg font-bold text-slate-900 mb-4 border-b-2 border-slate-300 pb-2">
                  {section.title}
                </h2>
                <table className="w-full mb-4">
                  <tbody>
                    {section.items.map((item, itemIdx) => (
                      <tr
                        key={itemIdx}
                        className={`border-b border-slate-200 ${
                          item.highlight ? "bg-slate-50" : ""
                        }`}
                      >
                        <td
                          className={`py-2 ${item.indent ? "pl-8" : "pl-0"} text-slate-700 ${
                            item.bold ? "font-semibold text-slate-900" : ""
                          }`}
                        >
                          {item.label}
                        </td>
                        <td
                          className={`text-right py-2 ${
                            item.bold ? "font-semibold text-slate-900" : "text-slate-600"
                          }`}
                        >
                          {formatCurrency(item.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {section.subtotal && (
                  <div className="flex justify-end mb-6 pr-4">
                    <div className="text-right">
                      <p className="text-sm text-slate-600 mb-1">{section.subtotal.label}</p>
                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrency(section.subtotal.value)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Notes */}
          {data.notes && data.notes.length > 0 && (
            <div className="mt-12 pt-6 border-t border-slate-200">
              <h3 className="font-bold text-slate-900 mb-3">Notes:</h3>
              <ul className="text-sm text-slate-600 space-y-2">
                {data.notes.map((note, idx) => (
                  <li key={idx}>• {note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
            <p>This report was generated from reconciled financial records.</p>
            <p>For professional tax advice, consult with a qualified tax professional.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
