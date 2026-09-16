import preset from "../../tailwind.preset.js";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/shared/src/**/*.{ts,tsx}"],
};
