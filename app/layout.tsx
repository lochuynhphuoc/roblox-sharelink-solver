import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoLink Resolver",
  description:
    "Resolve Roblox Share Links into Roblox IDs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
