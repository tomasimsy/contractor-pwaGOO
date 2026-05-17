import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/ui/BottomNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Estimate & Invoice App",
  description: "Manage estimates and invoices",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} bg-gray-200 min-h-screen flex justify-center`}
      >
        <div className="w-full max-w-md min-h-screen bg-gray-50 shadow-xl relative pb-20">
          {children}
          <BottomNav />
        </div>
      </body>
    </html>
  );
}