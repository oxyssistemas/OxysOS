/** Tema visual compartilhado entre admin e loja. */
/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        base: "#0D0D0D",
        panel: "#161616",
        elevated: "#131313",
        border: {
          DEFAULT: "#262626",
          strong: "#333333",
        },
        accent: {
          DEFAULT: "#1565FF",
          hover: "#2C74FF",
          muted: "rgba(21, 101, 255, 0.12)",
        },
        text: {
          primary: "#F5F5F5",
          secondary: "#A1A1A1",
          muted: "#6B6B6B",
        },
        danger: "#FF5B5B",
        success: "#34D399",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "12px",
      },
      keyframes: {
        "slide-in": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "slide-in": "slide-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.2s ease-out",
      },
    },
  },
  plugins: [],
};
