/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          base: '#050505', // Obsidian void — app background
          surface: '#0A0B0E', // Matte carbon — sidebar, elevated cards, panels
          elevated: '#101217', // Interactive inputs & code blocks
          hover: '#161922', // Hover/active surface
          muted: '#8A8F9E' // Steel secondary text
        },
        tier: {
          okf: '#5B8DB8', // Steel blue
          rag: '#8A82A8', // Violet-grey
          live: '#D9A441' // Amber
        },
        warning: {
          DEFAULT: '#C95A5A' // Muted red for retractions/conflicts
        }
      },
      fontFamily: {
        sans: ['"General Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
