/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        // CSS-variable driven — themes override these at runtime
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)',
        },
        wire: {
          1: 'var(--wire-1)',
          2: 'var(--wire-2)',
          3: 'var(--wire-3)',
          4: 'var(--wire-4)',
        },
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-right': {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'status-ping': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(0.95)' },
        },
        'scan-sweep': {
          '0%': { transform: 'translateY(-100%)', opacity: '0.6' },
          '100%': { transform: 'translateY(400%)', opacity: '0' },
        },
        'bar-fill': {
          '0%': { width: '0%' },
          '100%': { width: 'var(--bar-width)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out forwards',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'slide-right': 'slide-right 0.3s ease-out forwards',
        'status-ping': 'status-ping 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
        'scan-sweep': 'scan-sweep 2.4s linear infinite',
        'bar-fill': 'bar-fill 1.2s cubic-bezier(0.22,1,0.36,1) forwards',
      },
    },
  },
  plugins: [],
}
