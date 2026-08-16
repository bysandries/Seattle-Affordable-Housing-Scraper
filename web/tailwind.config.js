/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Google brand + Material color roles. Light/dark pairs follow the
      // palette Google Search itself uses (#202124 canvas, #303134 surfaces).
      colors: {
        google: {
          blue: '#4285f4',
          red: '#ea4335',
          yellow: '#fbbc05',
          green: '#34a853',
          'blue-ink': '#1a73e8', // buttons / actions on light surfaces
          'blue-deep': '#1967d2',
          link: '#1a0dab', // classic result-title blue
          'link-dark': '#8ab4f8',
        },
        gsurface: {
          DEFAULT: '#ffffff',
          dim: '#f8f9fa',
          chip: '#f1f3f4',
          dark: '#202124',
          'dark-raised': '#303134',
          'dark-chip': '#3c4043',
        },
        gink: {
          DEFAULT: '#202124',
          secondary: '#4d5156',
          tertiary: '#70757a',
          dark: '#e8eaed',
          'dark-secondary': '#bdc1c6',
          'dark-tertiary': '#9aa0a6',
        },
        gline: {
          DEFAULT: '#dadce0',
          dark: '#3c4043',
        },
      },
      fontFamily: {
        // Google Search body copy is Arial; product names use Google Sans.
        sans: ['arial', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        display: ['Google Sans', 'Product Sans', 'Roboto', 'arial', 'sans-serif'],
      },
      boxShadow: {
        // The search pill's resting and hovered elevation.
        pill: '0 1px 6px rgba(32, 33, 36, 0.28)',
      },
    },
  },
  plugins: [],
}
