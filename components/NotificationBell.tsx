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
        className="relative p-2 rounded-full hover:bg-muted transition"
      >
        <Bell size={20} className="text-primary" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-danger text-danger-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-60 bg-popover rounded-xl shadow-lg border border-border z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex justify-between items-center">
              <span className="text-xs font-bold text-popover-foreground">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-[10px] text-primary hover:text-primary/80">
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">No notifications</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-border hover:bg-muted transition ${!n.read ? "bg-primary/5" : ""}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-popover-foreground">{n.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/80 mt-1">
                          {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                      {!n.read && (
                        <button onClick={() => markAsRead(n.id)} className="p-1 text-primary hover:text-primary/80">
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