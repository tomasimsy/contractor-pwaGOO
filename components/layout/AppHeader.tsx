"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Breadcrumbs } from "./Breadcrumbs";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationsMenu } from "./NotificationsMenu";
import { UserMenu } from "./UserMenu";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { CompanySwitcher } from "./CompanySwitcher";
import { LocationSwitcher } from "./LocationSwitcher";
import { MobileNav } from "./MobileNav";

/** The top bar for every authenticated page — breadcrumbs + global
 * search + notifications + switchers + user menu, plus the mobile
 * nav's hamburger trigger (the drawer itself renders here too, since
 * this is the one component that owns its open/closed state). */
export function AppHeader() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <div className="hidden min-w-0 flex-1 sm:block">
            <Breadcrumbs />
          </div>

          {/* <div className="flex flex-1 justify-center lg:flex-none">
            <GlobalSearch />
          </div> */}

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <CompanySwitcher />
            {/* <LocationSwitcher /> */}
            <ThemeSwitcher />
            <NotificationsMenu />
            <div className="ml-1 h-6 w-px bg-border" aria-hidden="true" />
            <UserMenu />
          </div>
        </div>
      </header>

      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    </>
  );
}
