import type { Config } from 'tailwindcss';

/**
 * Brand design tokens.
 *
 * Colour values are SAMPLED from the "Hub Ideas v2" design deck mockups (decoded
 * pixel values, not eyeballed), so the palette matches the intended brand UI.
 *
 * The pre-existing token NAMES (ink, cream, terracotta, sage, stone, forest) are
 * kept and re-pointed at the new values — that shifts every existing component
 * to the brand palette without touching 43 files.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- core neutrals -------------------------------------------------
        ink: '#0A1A2F',        // headings / primary text (deck navy, was #191919)
        ink2: '#33404F',       // body copy — navy-tinted grey
        cream: '#FAF6F3',      // page canvas (sampled 21.9% of the dashboard mockup)
        stone: '#E4DDD6',      // hairline borders / dividers
        // --- brand navy ----------------------------------------------------
        navy: {
          DEFAULT: '#061B32',  // sidebar (sampled #061B32 / #061A31)
          soft: '#112031',     // navy cards & panels
          mid: '#16283C',      // hover states on navy
        },
        // --- terracotta ----------------------------------------------------
        terracotta: {
          DEFAULT: '#8B3324',  // primary accent (deep, sampled)
          mid: '#C38A6B',      // pills / active states
          light: '#EBBAA5',    // peach highlights
        },
        // --- warm surfaces -------------------------------------------------
        blush: {
          DEFAULT: '#F2EAE2',  // content cards
          deep: '#EDE5DD',     // card hover / alt rows
        },
        // --- supporting accents --------------------------------------------
        sage: '#C9CAB6',       // sage pills (sampled)
        'sage-pale': '#EEEAD0',
        olive: '#A4A66B',      // progress bars
        bronze: '#AC7D57',     // steppers, CPD, gold accents
        forest: '#0A1A2F',     // legacy alias -> navy (was #3a4f41)
      },
      fontFamily: {
        // Gestura / Basis Grotesque are licensed brand faces we cannot ship.
        // Fraunces (display serif) and Inter (grotesque) are the closest open
        // substitutes. Swap these two lines if the licensed webfonts arrive.
        heading: ['var(--font-display)', 'Gestura', 'Georgia', 'serif'],
        body: ['var(--font-sans)', 'Basis', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1rem',      // 16px — deck card radius
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(10, 26, 47, 0.04), 0 8px 24px -12px rgba(10, 26, 47, 0.10)',
        lift: '0 2px 4px rgba(10, 26, 47, 0.06), 0 16px 40px -16px rgba(10, 26, 47, 0.18)',
      },
      letterSpacing: {
        label: '0.15em',   // uppercase micro-labels
      },
      spacing: {
        // Sidebar width. SideNav paints it (`w-sidebar`) and Chrome reserves the
        // same space (`lg:pl-sidebar`) — one token so the two can never drift.
        sidebar: '280px',
        'sidebar-drawer': '300px',  // mobile drawer, slightly wider for thumbs
      },
    },
  },
  plugins: [],
};
export default config;
