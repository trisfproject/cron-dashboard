/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink: '#111827',
        muted: '#64748b',
        surface: '#f8fafc'
      }
    }
  },
  plugins: []
};
