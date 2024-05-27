const animate = require('tailwindcss-animate')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,jsx,vue}',
    './components/**/*.{js,jsx,vue}',
    './app/**/*.{js,jsx,vue}',
    './src/**/*.{js,jsx,vue}'
  ],
  daisyui: {
    styled: true, // if you want daisyUI to apply its styles
    themes: ['lofi'], // specify only 'light' theme
    base: true, // if you want to use daisyUI base styles
    utils: true, // if you want to use daisyUI utility classes
    logs: true, // if you want to see daisyUI logs in the console
    rtl: false, // set to true if you're using Right to Left language
    prefix: '' // if you want to set a prefix to daisyUI classes
  },
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif']
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    }
  },
  plugins: [animate, require('daisyui')]
}
