/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        enigma: {
          bg: "#EDEAF2",
          surface: "#FFFFFF",
          ink: "#14121C",
          muted: "#6B6578",
          violet: "#6D28D9",
          violetSoft: "#8B5CF6",
          navy: "#1E1B4B",
          line: "#E4E0EB",
        },
      },
    },
  },
  plugins: [],
};
