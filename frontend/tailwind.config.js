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
          base: '#09090B', // Canvas background
          surface: '#0C0C0F', // Sidebar & secondary surface
          card: '#111115', // Card surface
          elevated: '#111115', // Interactive inputs & code blocks
          hover: '#16161C', // Elevated / hover surface
          secondary: '#A1A1AA', // Secondary text
          muted: '#A1A1AA', // Secondary text (most common usage)
          faint: '#52525B' // Muted text
        },
        tier: {
          okf: '#60A5FA', // OKF (Structured) — steel blue
          rag: '#A78BFA', // RAG (Vector) — soft violet
          live: '#F59E0B' // LIVE (Academic) — warm amber
        },
        online: '#10B981', // Online status dot only
        warning: {
          DEFAULT: '#C95A5A' // Muted red for retractions/conflicts
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
