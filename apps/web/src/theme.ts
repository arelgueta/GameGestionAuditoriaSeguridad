/**
 * Tokens de diseño. Cambiá estos valores para adaptar la app a los colores
 * institucionales de la universidad: Tailwind los toma desde acá.
 */
export const theme = {
  colors: {
    brand: {
      50: '#eef4ff',
      100: '#d9e6ff',
      200: '#b6ceff',
      300: '#86acfb',
      400: '#5683f2',
      500: '#3461e0',
      600: '#2449c2',
      700: '#1f3b9b',
      800: '#1e347a',
      900: '#1c2e60',
    },
    accent: {
      400: '#fbbf24',
      500: '#f59e0b',
      600: '#d97706',
    },
    ok: { 100: '#dcfce7', 600: '#15803d', 700: '#166534' },
    warn: { 100: '#fef3c7', 600: '#b45309', 700: '#92400e' },
    danger: { 100: '#fee2e2', 600: '#b91c1c', 700: '#991b1b' },
    /** Pantalla proyectada (fondo oscuro). */
    stage: {
      bg: '#0b1220',
      panel: '#131c2e',
      line: '#26324a',
      text: '#eef2f8',
      muted: '#a9b4c8',
    },
  },
  fontFamily: {
    sans: ['"Inter"', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
    serif: ['Georgia', '"Times New Roman"', 'serif'],
  },
} as const;
