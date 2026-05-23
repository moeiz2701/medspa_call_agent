import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        aura: {
          // Deep, contrasty palette. The lighter tones are still available as
          // accents for chat bubbles / chips but the base UI now sits on the
          // darker end of the gradient.
          pink: '#f06aa5',
          rose: '#c84a82',
          magenta: '#a23770',
          plum: '#5c2a55',
          mauve: '#3d2050',
          purple: '#2d1944',
          indigo: '#1f1638',
          blue: '#3d5d99',
          sky: '#7aa5d6',
          ink: '#f4ecf6',
          night: '#0e0a1c',
          char: '#1a1226',
        },
      },
      backgroundImage: {
        'aura-gradient':
          'linear-gradient(160deg, #2d1944 0%, #3d2050 30%, #5c2a55 55%, #1f3a66 100%)',
        'aura-orb':
          'radial-gradient(circle at 32% 25%, #ffe6f0 0%, #f06aa5 18%, #a23770 42%, #4b2a6e 70%, #1a1838 95%)',
        'aura-glass':
          'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 100%)',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(8, 4, 20, 0.45)',
        orb: '0 18px 70px -8px rgba(240, 106, 165, 0.55), 0 0 120px rgba(93, 127, 184, 0.35), inset -18px -22px 50px rgba(10, 6, 24, 0.55), inset 14px 16px 38px rgba(255, 230, 240, 0.18)',
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'wave-slow': {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(-12px)' },
        },
        'orb-float': {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-8px) scale(1.02)' },
        },
        'orb-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'orb-spin-rev': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(-360deg)' },
        },
        pulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'wave-slow': 'wave-slow 4s ease-in-out infinite',
        'orb-float': 'orb-float 6s ease-in-out infinite',
        'orb-spin': 'orb-spin 22s linear infinite',
        'orb-spin-rev': 'orb-spin-rev 34s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
