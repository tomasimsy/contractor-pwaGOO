// "use client";

// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import { supabase } from "@/lib/supabase/client";
import { filterActive } from '@/lib/queries/softDeleteFilter';
// import { Invoice } from "@/types";
// import { formatCurrency, formatShortDate } from "@/lib/utils/formatting";
// import Header from "@/components/ui/Header";
// import { ArrowUpRight, CheckCircle2, AlertCircle, Clock } from "lucide-react";
// import ProtectedRoute from "@/components/auth/ProtectedRoute";

// export default function InvoicesPage() {
//   const router = useRouter();
//   const [invoices, setInvoices] = useState<Invoice[]>([]);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     loadInvoices();
//   }, []);

//   async function loadInvoices() {
//     const { data } = await supabase
//       .from("invoices")
//       .select("*, clients(name, phone)")
//       .order("locked_at", { ascending: false });

//     if (data) setInvoices(data as Invoice[]);
//     setLoading(false);
//   }

//   return (
//     <ProtectedRoute>
//       <div className="min-h-screen bg-gradient-to-tr from-[#eaf6ee] via-[#f7fcf9] to-white pb-32 font-sans antialiased selection:bg-emerald-100">
//         <Header title="Invoices" backLink="/" />

//         <div className="mx-auto max-w-xl p-5">
//           {/* TITLE HEADER */}
//           <div className="mb-7 flex items-center justify-between px-1">
//             <div>
//               <h1 className="text-2xl font-bold text-[#111827] tracking-tight">Invoices</h1>
//               <p className="text-xs font-medium text-gray-400 mt-0.5">Real-time settlement data pipeline</p>
//             </div>
//             {!loading && invoices.length > 0 && (
//               <div className="flex h-6 px-2.5 items-center justify-center rounded-full bg-[#053e2b] text-[11px] font-bold text-white shadow-sm">
//                 {invoices.length} active
//               </div>
//             )}
//           </div>

//           {/* LOADING STATE */}
//           {loading && (
//             <div className="rounded-3xl bg-white/80 backdrop-blur-md py-16 text-center text-sm font-medium text-gray-400 shadow-sm border border-white/40">
//               Recalculating ledgers...
//             </div>
//           )}

//           {/* INVOICE LIST */}
//           <div className="space-y-4">
//             {invoices.map((inv) => {
//               const subtotal = inv.total || 0;
//               const balanceDue = inv.remaining_balance || 0;
//               const totalPaid = subtotal - balanceDue;
              
//               // Math-Driven Progress Calculations
//               const paidPercentage = subtotal > 0 ? (totalPaid / subtotal) * 100 : 0;
//               const balancePercentage = 100 - paidPercentage;
              
//               // Assume a standard 20% deposit structure for visual splitting baseline
//               const depositRatio = Math.min(paidPercentage, 25);
//               const milestoneRatio = paidPercentage - depositRatio;

//               const isPaidInFull = balanceDue <= 0;
//               const isOverdue = inv.due_date ? new Date(inv.due_date) < new Date() && !isPaidInFull : false;

//               return (
//                 <div
//                   key={inv.id}
//                   onClick={() => router.push(`/invoices/${inv.id}`)}
//                   className="group relative cursor-pointer rounded-[28px] bg-white p-6 shadow-[0_8px_24px_rgba(9,43,31,0.03)] transition-all duration-300 hover:shadow-[0_16px_36px_rgba(9,43,31,0.07)] hover:-translate-y-0.5 border border-white"
//                 >
//                   {/* TOP ROW */}
//                   <div className="flex items-start justify-between">
//                     <div>
//                       <h2 className="text-lg font-bold text-[#1c2421] tracking-tight group-hover:text-emerald-900 transition-colors">
//                         {inv.clients?.name || "Untitled Client"}
//                       </h2>
//                       <p className="text-xs font-semibold text-gray-400/90 mt-0.5">
//                         Invoice ID <span className="text-gray-900 font-bold">#{inv.invoice_number}</span>
//                       </p>
//                     </div>

//                     <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-400 shadow-sm transition-all group-hover:bg-[#053e2b] group-hover:text-white group-hover:scale-105">
//                       <ArrowUpRight size={16} strokeWidth={2.5} />
//                     </div>
//                   </div>

//                   {/* FINANCIAL SUB-LEDGER METRICS */}
//                   <div className="mt-5 grid grid-cols-3 gap-2">
//                     <div>
//                       <span className="block text-[11px] font-medium text-gray-400">Subtotal</span>
//                       <span className="mt-0.5 block text-base font-bold text-[#1c2421]">
//                         {formatCurrency(subtotal)}
//                       </span>
//                     </div>
//                     <div>
//                       <span className="block text-[11px] font-medium text-gray-400">Total Paid</span>
//                       <span className="mt-0.5 block text-base font-bold text-emerald-600">
//                         {formatCurrency(totalPaid)}
//                       </span>
//                     </div>
//                     <div>
//                       <span className="block text-[11px] font-medium text-gray-400">Due Date</span>
//                       <span className={`mt-0.5 block text-[13px] font-bold ${isOverdue ? "text-red-500" : "text-gray-500"}`}>
//                         {inv.due_date ? formatShortDate(inv.due_date) : "On Receipt"}
//                       </span>
//                     </div>
//                   </div>

//                   {/* HIGH-PERFORMANCE DYNAMIC PROGRESS TRACK */}
//                   <div className="mt-5 flex h-6 w-full overflow-hidden rounded-full bg-gray-50 p-[3px] border border-gray-100/50">
//                     {/* Segment 1: Base Deposit Allocation */}
//                     {depositRatio > 0 && (
//                       <div 
//                         style={{ width: `${depositRatio}%` }} 
//                         className="h-full rounded-full bg-gradient-to-r from-[#dcedc1] to-[#a8e6cf] transition-all duration-500" 
//                       />
//                     )}
                    
//                     {/* Segment 2: Milestone Iteration Progress */}
//                     {milestoneRatio > 0 && (
//                       <div 
//                         style={{ width: `${milestoneRatio}%` }} 
//                         className="h-full rounded-full bg-[#5cdb5c] ml-[2px] transition-all duration-500" 
//                       />
//                     )}
                    
//                     {/* Segment 3: Pending Balance Remaining Gap */}
//                     {!isPaidInFull && (
//                       <div 
//                         style={{ width: `${balancePercentage}%` }} 
//                         className="h-full rounded-full opacity-40 ml-[2px] transition-all duration-500"
//                         style={{
//                           width: `${balancePercentage}%`,
//                           backgroundImage: 'linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 50%, #cbd5e1 50%, #cbd5e1 75%, transparent 75%, transparent)',
//                           backgroundSize: '10px 10px'
//                         }}
//                       />
//                     )}
//                   </div>

//                   {/* CONTEXT-AWARE INTELLIGENT FOOTER */}
//                   <div className="mt-4 flex items-center justify-between text-[11px] font-semibold text-gray-400 tracking-tight">
//                     <span>Issued {inv.created_at ? formatShortDate(inv.created_at) : "Today"}</span>
                    
//                     {/* Micro-Context Driven Pill Generation */}
//                     <div className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold shadow-sm transition-all ${
//                       isPaidInFull 
//                         ? "bg-emerald-50 text-emerald-700" 
//                         : isOverdue 
//                           ? "bg-red-50 text-red-600"
//                           : "bg-[#0d231d] text-white"
//                     }`}>
//                       {isPaidInFull ? (
//                         <>
//                           <CheckCircle2 size={11} strokeWidth={3} className="text-emerald-600" />
//                           <span>100% SETTLED</span>
//                         </>
//                       ) : isOverdue ? (
//                         <>
//                           <AlertCircle size={11} strokeWidth={3} className="text-red-500" />
//                           <span>OVERDUE • {formatCurrency(balanceDue)}</span>
//                         </>
//                       ) : (
//                         <>
//                           <Clock size={11} strokeWidth={3} className="text-emerald-400" />
//                           <span>BALANCE DUE <span className="text-[#a8e6cf] ml-0.5">{formatCurrency(balanceDue)}</span></span>
//                         </>
//                       )}
//                     </div>

//                     <span className="capitalize tracking-wider text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-md">
//                       {inv.status}
//                     </span>
//                   </div>

//                 </div>
//               );
//             })}
//           </div>
//         </div>

//         {/* PERSISTENT TAB BAR */}
//         <div className="fixed bottom-6 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 rounded-[32px] bg-[#05291e] p-2.5 shadow-[0_16px_32px_rgba(5,41,30,0.24)] border border-emerald-950/20">
//           <div className="flex items-center justify-around">
//             <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0a3a2b] text-white shadow-inner">
//               <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
//                 <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
//               </svg>
//             </button>
//             <button className="flex h-12 w-12 items-center justify-center rounded-full text-emerald-500/60 transition-colors hover:text-white">
//               <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
//                 <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
//               </svg>
//             </button>
//           </div>
//         </div>
//       </div>
//     </ProtectedRoute>
//   );
// }