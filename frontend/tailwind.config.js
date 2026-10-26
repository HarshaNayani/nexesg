/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}', './public/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#effaf3',
          100: '#d8f3e1',
          200: '#b4e6c6',
          300: '#82d2a2',
          400: '#4fb87c',
          500: '#2c9d62',
          600: '#1f7f4e',
          700: '#1a6541',
          800: '#175136',
          900: '#14432e',
        },
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d5d9e0',
          300: '#b1b8c4',
          400: '#8791a1',
          500: '#697386',
          600: '#525b6c',
          700: '#434a58',
          800: '#2b303b',
          900: '#161a22',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(22, 26, 34, 0.04), 0 1px 3px rgba(22, 26, 34, 0.06)',
      },
    },
  },
  plugins: [],
};
