import "./globals.css";

import type { Metadata } from "next";

import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "KEBO ERP",
  description: "Premium Restaurant ERP Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[#07090d] text-white antialiased"
        suppressHydrationWarning
      >
        <div className="flex min-h-screen">
          <Sidebar />

          <main className="flex-1 xl:ml-[290px] overflow-x-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}