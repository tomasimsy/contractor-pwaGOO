"use client";

import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">📴</div>
        <h1 className="text-2xl font-bold text-white mb-2">You're Offline</h1>
        <p className="text-gray-300 mb-6">
          Please check your internet connection.
        </p>
        <Link href="/dashboard">
          <button className="bg-gold text-navy px-6 py-2 rounded-lg font-semibold">
            Try Again
          </button>
        </Link>
      </div>
    </div>
  );
}