"use client";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro"}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-bg-border bg-bg-card hover:bg-bg-hover transition-colors text-zinc-400 hover:text-white"
    >
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
