import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        blue: {
          DEFAULT: "var(--blue)",
          dk: "var(--blue-dk)",
          md: "var(--blue-md)",
          lt: "var(--blue-lt)",
          xl: "var(--blue-xl)",
        },
        teal: {
          DEFAULT: "var(--teal)",
          dk: "var(--teal-dk)",
        },
        text: "var(--text)",
        muted: "var(--muted)",
        border: "var(--border)",
        "border-lt": "var(--border-lt)",
      },
      fontFamily: {
        sora: ["Sora", "sans-serif"],
        nunito: ["Nunito", "sans-serif"],
      },
      borderRadius: {
        sm: "12px",
        card: "16px",
        lg: "20px",
        full: "100px",
      },
    },
  },
  plugins: [],
};
export default config;
