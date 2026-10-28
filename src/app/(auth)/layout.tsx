import type { ReactNode } from "react";
import { Brand } from "@/components/shell/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-12">
      <Brand />
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
