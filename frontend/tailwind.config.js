/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      colors: {
        bg: {
          base:   "var(--bg-base)",
          card:   "var(--bg-card)",
          hover:  "var(--bg-hover)",
          border: "var(--bg-border)",
        },
        accent: {
          primary: "rgb(var(--accent-primary-rgb) / <alpha-value>)",
          blue:    "rgb(var(--accent-blue-rgb) / <alpha-value>)",
          amber:   "rgb(var(--accent-amber-rgb) / <alpha-value>)",
          red:     "rgb(var(--accent-red-rgb) / <alpha-value>)",
          purple:  "rgb(var(--accent-purple-rgb) / <alpha-value>)",
        },
      },
      animation: {
        "pulse-dot": "pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in": "slideIn 0.3s ease-out",
        "fade-in": "fadeIn 0.4s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [
    // Adds `scrollbar-hide` utility to hide scrollbars while keeping scroll functionality
    function ({ addUtilities }) {
      addUtilities({
        ".scrollbar-hide": {
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
          "&::-webkit-scrollbar": {
            display: "none",
          },
        },
      });
    },
  ],
};
