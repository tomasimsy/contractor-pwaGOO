"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface HeaderProps {
  title: string;
  backLink?: string;
  rightAction?: React.ReactNode;
}

export default function Header({
  title,
  backLink,
  rightAction,
}: HeaderProps) {
  // No unread count since we're not using a table

  return (
    <div className="bg-navy border-b border-gold/20 px-4 py-3 flex items-center sticky top-0 z-10 shadow-md">
      
      {/* Left */}
      <div className="w-10 flex justify-start">
        {backLink && (
          <Link
            href={backLink}
            className="text-gold text-xl hover:text-gold-light transition"
          >
            ←
          </Link>
        )}
      </div>
      

      {/* Center */}
      <div className="flex-1 text-center">
        <h1 className="font-semibold text-sm text-white">
          {title}
        </h1>
      </div>

      <button
  onClick={async () => {
    // Check if browser supports notifications
    if (!("Notification" in window)) {
      alert("Your browser does not support notifications");
      return;
    }
    
    // Check current permission
    console.log("Current permission:", Notification.permission);
    
    if (Notification.permission === "denied") {
      alert("Notifications are blocked. Please enable them in your browser settings.");
      return;
    }
    
    if (Notification.permission === "granted") {
      // Send test notification
      const notification = new Notification("Test Notification", {
        body: "✅ Notifications are working!",
        icon: "/favicon.ico",
        tag: "test",
      });
      console.log("Notification sent:", notification);
      alert("Test notification sent! Check your screen.");
      return;
    }
    
    // Request permission
    const permission = await Notification.requestPermission();
    console.log("Permission result:", permission);
    
    if (permission === "granted") {
      const notification = new Notification("Permission Granted!", {
        body: "You will now receive notifications when clients sign documents.",
        icon: "/favicon.ico",
      });
      alert("Notifications enabled! Test notification sent.");
    } else {
      alert("Notifications were denied. You won't receive alerts.");
    }
  }}
  className="bg-gold text-navy px-3 py-1 rounded text-sm"
>
  🔔 Enable Notifications
</button>

      {/* Right */}
      <div className="w-10 flex justify-end">
        {rightAction && (
          <div className="text-gold">
            {rightAction}
          </div>
        )}
      </div>

    </div>
  );
}