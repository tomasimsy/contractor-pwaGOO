"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface HeaderProps {
title: string;
backLink?: string;
rightAction?: React.ReactNode;
/** Desktop/tablet pages wrapped in DesktopShell already get an
 * equivalent title bar next to the sidebar — this hides the mobile
 * app-bar version at `md:` and up instead of showing both. */
mdHidden?: boolean;
}

export default function Header({
title,
backLink,
rightAction,
mdHidden,
}: HeaderProps) {
// No unread count since we're not using a table

return (
<div className={`bg-primary border-b border-primary-foreground/10 px-4 py-3 flex items-center sticky top-0 z-10 shadow-md ${mdHidden ? "md:hidden" : ""}`}>

  {/* Left */}
  <div className="w-10 flex justify-start">
    {backLink && (
    <Link href={backLink} className="text-primary-foreground text-xl hover:text-primary-foreground/80 transition">
    ←
    </Link>
    )}
  </div>

  {/* Center */}
  <div className="flex-1 text-center">
    <h1 className="font-semibold text-sm text-primary-foreground">
      {title}
    </h1>
  </div>

  {/* Right */}
  <div className="w-10 flex justify-end">
    {rightAction && (
    <div className="text-primary-foreground">
      {rightAction}
    </div>
    )}
  </div>

</div>
);
}