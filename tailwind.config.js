/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f5f3ee",
        paper: "#fbfaf7",
        ink: "#252a2e",
        muted: "#6f757a",
        line: "#dedbd3",
        sage: "#5f7f72",
        steel: "#607d8b",
        clay: "#8b635f",
        sand: "#d7c9ae"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(44, 51, 56, 0.08)"
      }
    }
  },
  plugins: []
};
