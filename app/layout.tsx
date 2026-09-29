import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import LayoutClient from "@/components/LayoutClient";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "KEBO ERP",
  description: "Premium Restaurant ERP Management System",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "KEBO", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

// Next 16'da themeColor metadata yerine viewport export'unda tanımlanır.
export const viewport: Viewport = {
  themeColor: "#0b0d0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-[#0b0d0f] text-[#f4f0e8] antialiased" suppressHydrationWarning>
        <LayoutClient>{children}</LayoutClient>
      </body>
    </html>
  );
}
