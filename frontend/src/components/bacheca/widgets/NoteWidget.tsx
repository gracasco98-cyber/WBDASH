"use client";
import { useState, useEffect, useRef } from "react";

interface Props {
  config?: { text?: string };
  onConfigChange: (config: { text: string }) => void;
}

const SAVE_DEBOUNCE_MS = 600;

export default function NoteWidget({ config, onConfigChange }: Props) {
  const [text, setText] = useState(config?.text ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleChange = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onConfigChange({ text: value }), SAVE_DEBOUNCE_MS);
  };

  return (
    <textarea
      value={text}
      onChange={e => handleChange(e.target.value)}
      placeholder="Scrivi una nota veloce…"
      className="w-full h-full resize-none bg-transparent text-sm text-amber-950/90 placeholder:text-amber-950/40 focus:outline-none leading-snug"
    />
  );
}
