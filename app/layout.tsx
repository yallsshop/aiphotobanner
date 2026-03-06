import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Photo Banner | Dealership Photo Intelligence",
  description: "AI-powered photo banners for car dealerships. Classify, label, and brand your inventory photos in minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased noise-overlay">
        {children}
      </body>
    </html>
  );
}
