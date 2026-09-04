"use client";
import { Pin } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import BachecaBoard from "@/components/bacheca/BachecaBoard";

export default function BachecaPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div
            className="min-h-[calc(100vh-57px)] px-4 md:px-8 py-6"
            style={{
              backgroundColor: "#a97c50",
              backgroundImage: `
                radial-gradient(circle at 15% 20%, rgba(0,0,0,0.08) 0, transparent 3%),
                radial-gradient(circle at 65% 10%, rgba(0,0,0,0.06) 0, transparent 2.5%),
                radial-gradient(circle at 35% 45%, rgba(0,0,0,0.07) 0, transparent 3%),
                radial-gradient(circle at 80% 55%, rgba(0,0,0,0.05) 0, transparent 2%),
                radial-gradient(circle at 10% 70%, rgba(0,0,0,0.06) 0, transparent 2.5%),
                radial-gradient(circle at 55% 80%, rgba(0,0,0,0.08) 0, transparent 3%),
                radial-gradient(circle at 90% 85%, rgba(0,0,0,0.05) 0, transparent 2%),
                radial-gradient(circle at 25% 95%, rgba(0,0,0,0.06) 0, transparent 2.5%),
                linear-gradient(160deg, rgba(255,255,255,0.04), rgba(0,0,0,0.08))
              `,
              backgroundSize: "140px 140px, 110px 110px, 160px 160px, 120px 120px, 130px 130px, 150px 150px, 100px 100px, 125px 125px, 100% 100%",
            }}
          >
            <div className="max-w-[1600px] mx-auto space-y-5">
              <div className="flex items-center gap-2">
                <Pin size={18} className="text-white/90 drop-shadow" />
                <h1 className="text-xl font-bold text-white drop-shadow-sm">La tua bacheca</h1>
              </div>
              <BachecaBoard />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
