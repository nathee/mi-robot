import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/appConfig";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "WLKATA Mirobot 6-DOF Robot Arm Web Simulator — FK/IK, 3D Gizmos, Path Planning (MoveJ/MoveL/MoveC), and G-code.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-slate-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
