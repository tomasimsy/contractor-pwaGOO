"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, ClipboardList, Settings, Play, Square, ReceiptText } from "lucide-react";
import { useTrip } from "@/components/mileage/context/TripContext";
import toast from "react-hot-toast";

export default function BottomNav() {
  const pathname = usePathname();
  const { start, isTripActive, isSaving, startTrip, endTrip, completeTrip } = useTrip();

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Estimates", href: "/estimates", icon: ClipboardList },
  { label: "Invoices", href: "/invoices", icon: FileText },
    { label: "Expenses", href: "/expense", icon: ReceiptText },
  { label: "Settings", href: "/settings", icon: Settings },
];

  const handleTripToggle = async () => {
    if (isTripActive) {
      try {
        const endPhoto = await endTrip();
        if (start && endPhoto) {
          await completeTrip(start, endPhoto);
        }
      } catch (error: any) {
        toast.error(error.message || "Failed to complete trip.");
      }
    } else {
      try {
        await startTrip();
      } catch (error: any) {
        toast.error(error.message || "Failed to start trip.");
      }
    }
  };

  // Determine button colors based on state
  let bgColor = "bg-blue-500 hover:bg-blue-600"; // default (loading)
  let textColor = "text-white";
  let icon = <Play size={18} className="stroke-[2px]" />;
  let label = "Start Trip";

  if (isSaving) {
    bgColor = "bg-blue-500 hover:bg-blue-600";
    icon = <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />;
    label = "Saving...";
  } else if (isTripActive) {
    bgColor = "bg-red-500 hover:bg-red-600";
    icon = <Square size={18} className="stroke-[2px] animate-pulse" />;
    label = "Stop Trip";
  } else {
    bgColor = "bg-green-700 hover:bg-green-600";
    icon = <Play size={18} className="stroke-[2px]" />;
    label = "Start Trip";
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/60 bg-white/90 backdrop-blur-md pb-safe">
      <div className="mx-auto flex h-16 max-w-xl items-center justify-around px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center w-20 h-full transition-all relative group"
            >
              <div
                className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? "text-emerald-600 bg-emerald-600/10 font-semibold"
                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 font-medium"
                }`}
              >
                <Icon
                  size={18}
                  className={`transition-transform duration-200 group-active:scale-95 ${
                    isActive ? "stroke-[2.25px]" : "stroke-[1.75px]"
                  }`}
                />
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </div>
            </Link>
          );
        })}

        {/* Trip Toggle Button */}
        <button
          onClick={handleTripToggle}
          disabled={isSaving}
          className={`flex flex-col items-center justify-center w-20 h-full transition-all relative group`}
        >
          <div
            className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-200 ${bgColor} text-white shadow-md hover:shadow-lg`}
          >
            {icon}
            <span className="text-[10px] tracking-tight font-medium">{label}</span>
          </div>
        </button>
      </div>
    </div>
  );
}