"use client";

import Link from "next/link";

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
  return (
    <div className="bg-navy border-b bg-primary text-white border-gold/20 px-4 py-3 flex items-center sticky top-0 z-10 shadow-md">
      
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
      <div className="flex-1   text-center">
        <h1 className="font-semibold  text-sm text-dark">
          {title}
        </h1>
      </div>

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