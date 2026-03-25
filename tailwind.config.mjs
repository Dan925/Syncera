/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        cream: '#f0ebe1',
        'cream-dark': '#e8e2d6',
        brown: {
          900: '#2d2319',
          800: '#3d3027',
          700: '#5c4a3a',
          600: '#7a6654',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  safelist: [
    'bg-green-800',
    'bg-red-800',
    'translate-y-0',
    'opacity-100',
  ],
  plugins: [],
};
