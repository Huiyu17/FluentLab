"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, isNavItemActive } from "./nav";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {NAV_SECTIONS.map((section, i) => (
        <div key={section.label ?? i} className="flex flex-col gap-1">
          {section.label && (
            <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {section.label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgb(31_29_26/0.04)]"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    <Icon
                      aria-hidden
                      className={cn("size-4", active ? "text-primary" : "text-muted-foreground")}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
