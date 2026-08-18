import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ab-land — Alberta Crown mineral tenure",
  description:
    "Search Alberta Crown mineral agreements by company, agreement number, or location.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        Definite-height app shell: the viewport is split into fixed header, a
        scrolling content area, and fixed footer. Pages that must fill the
        screen (the map home) can then use a plain `h-full` instead of
        subtracting a hardcoded chrome height, which drifts whenever the
        header or footer text size changes.
      */}
      <body className="h-dvh flex flex-col overflow-hidden">
        <Header />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        <footer className="shrink-0 border-t border-zinc-200 px-6 py-3 text-xs text-zinc-500 dark:border-zinc-800">
          Crown agreement tenure, not land title. Mineral data © Government of Alberta, used
          under the Open Government Licence – Alberta.
        </footer>
      </body>
    </html>
  );
}
