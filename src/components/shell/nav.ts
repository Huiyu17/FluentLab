import {
  BookOpen,
  Bookmark,
  ChartLine,
  History,
  MessageSquareQuote,
  MessagesSquare,
  NotebookPen,
  Settings,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };
export type NavSection = { label: string | null; items: NavItem[] };

/** Sidebar structure (docs/ARCHITECTURE.md → Route structure). */
export const NAV_SECTIONS: NavSection[] = [
  { label: null, items: [{ href: "/today", label: "Today", icon: Sun }] },
  {
    label: "Learn",
    items: [
      { href: "/vocabulary", label: "Vocabulary", icon: BookOpen },
      { href: "/expressions", label: "Expressions", icon: MessageSquareQuote },
      { href: "/my-english", label: "My English", icon: Bookmark },
    ],
  },
  {
    label: "Practice",
    items: [
      { href: "/simulator", label: "Real-Life Simulator", icon: MessagesSquare },
      { href: "/conversations", label: "Conversation History", icon: History },
      { href: "/debrief", label: "Real-Life Debrief", icon: NotebookPen },
    ],
  },
  {
    label: "Progress",
    items: [
      { href: "/gaps", label: "Gap Tracker", icon: Target },
      { href: "/profile", label: "Fluency Profile", icon: ChartLine },
    ],
  },
  { label: "You", items: [{ href: "/settings", label: "Settings", icon: Settings }] },
];

/** A nav item is active for its own path and any nested path. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
