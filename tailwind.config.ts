import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0C224B',
        brand: '#2AA4E7',
        ocean: '#0A60AD',
        cream: '#FFFAE6',
        mist: '#E9FCFF',
        frost: '#A9EFFB',
        silver: '#E8EBEF',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
