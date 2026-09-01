import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import LayoutClient from "@/components/LayoutClient";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "KEBO ERP",
  description: "Premium Restaurant ERP Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-[#f4f5f7] text-[#1a1f2e] antialiased" suppressHydrationWarning>
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
