/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#09090B',
        sidebar: '#0C0C0F',
        surface: '#111115',
        panel: '#111115',
        card: '#111115',
        border: 'rgba(255, 255, 255, 0.07)',
        'text-primary': '#EDEDED',
        'text-secondary': '#8B8B8E',
        accent: {
          DEFAULT: '#60A5FA',
          hover: '#3B82F6',
        },
        tier: {
          okf: '#60A5FA',
          rag: '#A78BFA',
          live: '#F59E0B',
        },
        // Mapped aliases to exact Obsidian palette
        ink: {
          base: '#09090B',
          surface: '#111115',
          card: '#111115',
          elevated: '#111115',
          hover: '#18181E',
          secondary: '#8B8B8E',
          muted: '#8B8B8E',
          faint: '#71717A',
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
