/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          bg: "#0c0e14",
          surface: "#141721",
          border: "#242938",
          card: "#1a1f2c",
          gold: "#e6af2e",
          cyan: "#38bdf8",
          amber: "#f59e0b",
          crimson: "#ef4444",
          purple: "#a855f7"
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [],
}
