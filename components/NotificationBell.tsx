"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { useNotifications } from "@/context/NotificationContext";
import { formatDistanceToNow } from "date-fns";

export default function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-slate-100 transition"
      >
        <Bell size={20} className="text-emerald-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-[10px] text-emerald-600 hover:text-emerald-700">
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">No notifications</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition ${!n.read ? "bg-emerald-50/30" : ""}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                      {!n.read && (
                        <button onClick={() => markAsRead(n.id)} className="p-1 text-emerald-600 hover:text-emerald-700">
                          <Check size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}