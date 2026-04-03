/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0d0d0d',
          raised: '#111111',
          overlay: '#1a1a1a',
          border: '#2a2a2a'
        },
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8'
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Geist Mono"', 'monospace']
      }
    }
  },
  plugins: []
}
