import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Traffic Insight Dashboard",
  description: "Live traffic and historical analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="min-h-screen flex flex-col">
          <header className="h-16 border-b flex items-center justify-between px-6">
            <h1 className="text-base sm:text-lg font-semibold">
              Traffic Insight
            </h1>
            <nav className="text-sm text-muted-foreground">
              {/* Navigation placeholder */}
            </nav>
          </header>
          <div className="flex flex-1 min-h-0">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
