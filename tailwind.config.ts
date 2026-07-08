import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#191919',
        ink2: '#222222',
        terracotta: '#a45248',
        cream: '#f8f6f3',
        sage: '#d0d1ab',
        stone: '#e6e3df',
        forest: '#3a4f41',
      },
      fontFamily: {
        heading: ['Gestura', 'Georgia', 'serif'],
        body: ['Basis', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
