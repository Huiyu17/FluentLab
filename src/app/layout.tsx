import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "FluentLab", template: "%s · FluentLab" },
  description: "Practice real-life English conversations and learn to sound natural, not just correct.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
