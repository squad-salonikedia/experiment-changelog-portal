import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flywheel | SquadStack",
  description: "Track voice agent experiments, measure what moves, share wins",
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
