import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Management Platform",
  description: "Internal admin platform for AI-assisted article publishing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
