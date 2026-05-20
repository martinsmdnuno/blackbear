/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        night: {
          950: '#070b16',
          900: '#0b1020',
          850: '#10172b',
          800: '#161f38',
          700: '#1f2b4a',
          600: '#2c3b63'
        },
        gold: {
          DEFAULT: '#d4af37',
          light: '#eccd63',
          dark: '#a8861f'
        },
        blood: {
          DEFAULT: '#c0392b',
          light: '#e15a4a',
          dark: '#8e261b'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 4px 20px -4px rgba(0, 0, 0, 0.5)'
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        shimmer: 'shimmer 1.5s infinite'
      }
    }
  },
  plugins: []
};
