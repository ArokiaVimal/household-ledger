import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Pwa } from "@/components/pwa";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Personal Finance App",
  description: "Track your own spending, then split with your partner and friends",
  appleWebApp: { capable: true, title: "Finance", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#f3f2f8", viewportFit: "cover", width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Pwa />
        {children}
      </body>
    </html>
  );
}
