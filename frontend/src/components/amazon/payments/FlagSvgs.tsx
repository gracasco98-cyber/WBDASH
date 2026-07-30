export function FlagIT({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.68);
  return (
    <svg width={size} height={h} viewBox="0 0 22 15" className="rounded-[2px] shrink-0">
      <rect width="7" height="15" fill="#009246" />
      <rect x="7" width="8" height="15" fill="#fff" />
      <rect x="15" width="7" height="15" fill="#CE2B37" />
    </svg>
  );
}

export function FlagDE({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.68);
  return (
    <svg width={size} height={h} viewBox="0 0 22 15" className="rounded-[2px] shrink-0">
      <rect width="22" height="5" fill="#000" />
      <rect y="5" width="22" height="5" fill="#DD0000" />
      <rect y="10" width="22" height="5" fill="#FFCE00" />
    </svg>
  );
}

export function FlagFR({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.68);
  return (
    <svg width={size} height={h} viewBox="0 0 22 15" className="rounded-[2px] shrink-0">
      <rect width="7" height="15" fill="#002395" />
      <rect x="7" width="8" height="15" fill="#fff" />
      <rect x="15" width="7" height="15" fill="#ED2939" />
    </svg>
  );
}

export function FlagES({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.68);
  return (
    <svg width={size} height={h} viewBox="0 0 22 15" className="rounded-[2px] shrink-0">
      <rect width="22" height="15" fill="#AA151B" />
      <rect y="3.75" width="22" height="7.5" fill="#F1BF00" />
    </svg>
  );
}

/** Returns the inline flag SVG for the given marketplace code. Returns null for unknown codes. */
export function getFlagSm(marketplace: string): JSX.Element | null {
  switch (marketplace) {
    case "IT": return <FlagIT size={16} />;
    case "DE": return <FlagDE size={16} />;
    case "FR": return <FlagFR size={16} />;
    case "ES": return <FlagES size={16} />;
    default:   return null;
  }
}

export function getFlag(marketplace: string): JSX.Element | null {
  switch (marketplace) {
    case "IT": return <FlagIT size={20} />;
    case "DE": return <FlagDE size={20} />;
    case "FR": return <FlagFR size={20} />;
    case "ES": return <FlagES size={20} />;
    default:   return null;
  }
}

export const MP_LABEL: Record<string, string> = {
  IT: "Italia",
  DE: "Germania",
  FR: "Francia",
  ES: "Spagna",
};
