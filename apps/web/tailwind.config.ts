import type { Config } from 'tailwindcss';
import { theme } from './src/theme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: theme.colors,
      fontFamily: { sans: [...theme.fontFamily.sans], serif: [...theme.fontFamily.serif] },
    },
  },
  plugins: [],
} satisfies Config;
