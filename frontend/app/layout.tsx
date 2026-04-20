import type { Metadata } from "next";
import { Lato, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { AuthBootstrap } from "@/components/AuthBootstrap";

const lato = Lato({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-lato",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Litmus",
  description: "Wet lab validation for AI-driven research",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${lato.variable} ${jetbrainsMono.variable}`}>
      <body>
        <AuthBootstrap />
        <Navbar />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
