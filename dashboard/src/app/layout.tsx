import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Super Yo — Dashboard",
  description: "Sistema Operativo Personal de Nahuel",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-[#0f0f12] text-[#f0f0f5] antialiased">
        {children}
      </body>
    </html>
  );
}
