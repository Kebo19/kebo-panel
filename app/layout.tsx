import "./globals.css";
import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "KEBO ERP",
  description: "Premium Restaurant ERP Management System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning>
      <body className="min-h-screen bg-[#060810] text-white antialiased" suppressHydrationWarning>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden
            pt-14 pb-20 lg:pt-0 lg:pb-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
