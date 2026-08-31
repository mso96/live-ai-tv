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
  title: "The Morning Post",
  description: "Live news, strange reports and highly questionable journalism. The Morning Post is on air.",
  applicationName: "The Morning Post",
  openGraph: {
    title: "The Morning Post",
    description: "Live news, strange reports and highly questionable journalism.",
    siteName: "The Morning Post",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "The Morning Post",
    description: "Live news, strange reports and highly questionable journalism.",
  },
  icons: {
    icon: [
      { url: "/favicon.svg?v=morning-post-1", type: "image/svg+xml" },
      { url: "/favicon-32.png?v=morning-post-1", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/favicon.ico?v=morning-post-1",
    apple: { url: "/apple-touch-icon.png?v=morning-post-1", sizes: "180x180", type: "image/png" },
  },
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
        {children}
      </body>
    </html>
  );
}
