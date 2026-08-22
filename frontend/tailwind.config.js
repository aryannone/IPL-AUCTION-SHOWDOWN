/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        gold: { DEFAULT: '#D4AF37', light: '#F4D06F', dark: '#9C7A1E' },
        ink: { 900: '#0A0E17', 800: '#0F1522', 700: '#151C2C' },
      },
      fontFamily: {
        display: ['"Bebas Neue"', '"Oswald"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 25px rgba(212,175,55,0.35)',
      },
    },
  },
  plugins: [],
}
