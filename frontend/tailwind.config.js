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
          base: '#0A0E14', // Near-black ink base
          surface: '#121820', // Slightly lighter for panels
          muted: '#8A95A5'
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
