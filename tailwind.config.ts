import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0A0A0B',
        surface: '#111113',
        'surface-2': '#18181B',
        'surface-3': '#1E1E22',
        border: '#2A2A2E',
        'border-subtle': '#1E1E22',
        amber: {
          DEFAULT: '#D4A574',
          50: '#FDF6EE',
          100: '#FAEBD8',
          200: '#F5D7B2',
          300: '#EFC38B',
          400: '#E8AE64',
          500: '#D4A574',
          600: '#C08040',
          700: '#9A6430',
          800: '#744A24',
          900: '#4E3118',
        },
        muted: '#6B6B78',
        'muted-foreground': '#9B9BAA',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'fade-slide-in': 'fadeSlideIn 0.3s ease-out',
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease infinite',
      },
      keyframes: {
        fadeSlideIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseDot: {
          '0%, 80%, 100%': { transform: 'scale(0.6)', opacity: '0.4' },
          '40%': { transform: 'scale(1)', opacity: '1' },
        },
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}

export default config
