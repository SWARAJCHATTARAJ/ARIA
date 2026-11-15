/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#0A0A0B',
        panel: '#141416',
        card: '#141416',
        border: '#262629',
        'text-primary': '#EDEDED',
        'text-secondary': '#8B8B8E',
        accent: {
          DEFAULT: '#5E8BFF',
          hover: '#4E7BF0',
        },
        tier: {
          okf: '#5E8BFF',
          rag: '#A78BFA',
          live: '#34D399',
        },
        // Mapped legacy aliases to exact non-negotiable palette
        ink: {
          base: '#0A0A0B',
          surface: '#141416',
          card: '#141416',
          elevated: '#141416',
          hover: '#1B1B1E',
          secondary: '#8B8B8E',
          muted: '#8B8B8E',
          faint: '#8B8B8E',
        },
        warning: {
          DEFAULT: '#EF4444',
        },
      },
      borderRadius: {
        btn: '6px',
        card: '8px',
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        hero: ['40px', { lineHeight: '48px' }],
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        cardHover: '0 4px 12px rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
