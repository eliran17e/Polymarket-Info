/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // One disciplined family. Numbers use tabular figures (see index.css).
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Neutral gray base — 3 text shades, 2 surfaces, 2 borders.
        page: "#FAFAF9",
        surface: "#FFFFFF",
        line: "#ECECEC",
        "line-strong": "#DEDEDE",
        ink: {
          900: "#1B1B1F", // primary text
          600: "#6A6A73", // secondary
          400: "#9B9BA3", // tertiary / captions
        },
        // ONE accent, used sparingly (links, active, the probability bar).
        accent: {
          DEFAULT: "#5B5BD6",
          soft: "#EDEDFB",
        },
        // Reserved ONLY for price movement.
        up: "#1A8754",
        down: "#D64545",
      },
      fontSize: {
        // A small, deliberate scale — hierarchy via size + weight, not color.
        micro: ["11px", { lineHeight: "16px", letterSpacing: "0.04em" }],
        caption: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        lg: ["16px", { lineHeight: "22px" }],
        xl: ["19px", { lineHeight: "26px" }],
        "2xl": ["24px", { lineHeight: "30px" }],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
