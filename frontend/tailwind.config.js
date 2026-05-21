/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Blackbear palette. `night` is the dark scale: deep-sea-blue body with
        // midnight-black panels, per the brand book.
        night: {
          950: '#081223', // deepest (log panes, progress tracks)
          900: '#0C1B33', // Deep Sea Blue — primary background
          850: '#1A1A1A', // Midnight Black — cards, sidebar, modals
          800: '#242427', // inner chips / inputs
          700: '#33333a', // hover / neutral badges
          600: '#414149'
        },
        gold: {
          DEFAULT: '#C9A055', // Treasure Gold — primary action
          light: '#DDBE7E',
          dark: '#A8843F'
        },
        blood: {
          DEFAULT: '#8B0000', // Mutiny Red — destructive / error fills
          light: '#E15A4A', // readable error text on dark
          dark: '#5E0000'
        },
        parchment: '#E8E3D2', // primary text
        silver: '#8A93A6' // secondary text / disabled
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Pirata One"', 'system-ui', 'cursive']
      },
      boxShadow: {
        card: '0 6px 24px -6px rgba(0, 0, 0, 0.6)'
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
