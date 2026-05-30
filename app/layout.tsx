import "./globals.css";
import type { Metadata } from "next";
import LayoutClient from "@/components/LayoutClient";

export const metadata: Metadata = {
  title: "KEBO ERP",
  description: "Premium Restaurant ERP Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-screen bg-[#060810] text-white antialiased" suppressHydrationWarning>
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
