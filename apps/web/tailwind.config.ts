import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#08070D",
        panel: "#11101A",
        ridge: "#1A1429",
        purple: "#7C5CFF",
        lavender: "#9D7CFF",
        playorange: "#FF7A21",
        mist: "#F7F7FA",
        muted: "#A6A3B2"
      }
    }
  },
  plugins: []
};

export default config;
