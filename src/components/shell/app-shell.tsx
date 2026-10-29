import { Suspense, type ReactNode } from "react";
import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { SidebarNav } from "./sidebar-nav";
import { SetupNotice } from "./setup-notice";

/** Sidebar navigation reads the pathname; keep it behind Suspense so dynamic routes still prerender. */
function NavFallback() {
  return <div aria-hidden className="h-96" />;
}

export function AppShell({ children, account }: { children: ReactNode; account?: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-card px-4 py-2 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-6 overflow-y-auto border-r bg-sidebar p-4 lg:flex">
        <Brand />
        <Suspense fallback={<NavFallback />}>
          <SidebarNav />
        </Suspense>
        <div className="mt-auto">{account}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-4 py-3 lg:hidden">
          <Suspense fallback={<div className="size-9" />}>
            <MobileNav account={account} />
          </Suspense>
          <Brand />
        </header>

        <SetupNotice />

        <main id="main" className="mx-auto w-full max-w-[1080px] flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
