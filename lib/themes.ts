// UI design templates for the portal. Each template maps to a [data-theme] CSS
// variable block declared in index.html; applying one is a runtime attribute swap.

export type ThemeId = 'eventflow' | 'ocean' | 'forest' | 'sage' | 'paper' | 'graphite';

export interface ThemeTemplate {
  id: ThemeId;
  name: string;
  description: string;
  /** Hex colors used only to paint the miniature dashboard preview cards. */
  preview: {
    accent: string;
    accentSoft: string;
    sidebar: string;
    background: string;
    surface: string;
    border: string;
    textMuted: string;
  };
}

export const THEME_STORAGE_KEY = 'reams-ui-theme';
export const DEFAULT_THEME_ID: ThemeId = 'eventflow';

export const THEMES: ThemeTemplate[] = [
  {
    id: 'eventflow',
    name: 'EventFlow',
    description: 'Brand indigo with warm stone neutrals. The original look.',
    preview: {
      accent: '#4B3FE4',
      accentSoft: '#EEEDFC',
      sidebar: '#0F0F0E',
      background: '#F5F3EE',
      surface: '#FFFFFF',
      border: '#E0DDD4',
      textMuted: '#C5C2BA'
    }
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Classic blue accent on cool slate neutrals.',
    preview: {
      accent: '#2563EB',
      accentSoft: '#DBEAFE',
      sidebar: '#0F172A',
      background: '#F1F5F9',
      surface: '#FFFFFF',
      border: '#E2E8F0',
      textMuted: '#CBD5E1'
    }
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep emerald green with soft stone neutrals.',
    preview: {
      accent: '#047857',
      accentSoft: '#D1FAE5',
      sidebar: '#022C22',
      background: '#FAFAF9',
      surface: '#FFFFFF',
      border: '#E7E5E4',
      textMuted: '#D6D3D1'
    }
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Soft desaturated greens — calm and restful.',
    preview: {
      accent: '#3F6C51',
      accentSoft: '#E1EBE4',
      sidebar: '#1C2620',
      background: '#EEF1EC',
      surface: '#FAFBF8',
      border: '#D4DAD2',
      textMuted: '#B7BFB5'
    }
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm sepia reading mode — ivory cards, easy on the eyes.',
    preview: {
      accent: '#A16207',
      accentSoft: '#FEF9C3',
      sidebar: '#211D16',
      background: '#F1EBDF',
      surface: '#FBF8F1',
      border: '#DDD4C2',
      textMuted: '#C4BBA8'
    }
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Minimal monochrome with a near-black accent.',
    preview: {
      accent: '#18181B',
      accentSoft: '#E4E4E7',
      sidebar: '#09090B',
      background: '#FAFAFA',
      surface: '#FFFFFF',
      border: '#E4E4E7',
      textMuted: '#D4D4D8'
    }
  }
];

const isThemeId = (value: string | null): value is ThemeId =>
  !!value && THEMES.some((theme) => theme.id === value);

export const getSavedThemeId = (): ThemeId => {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
};

export const applyTheme = (id: ThemeId) => {
  if (id === DEFAULT_THEME_ID) {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Storage unavailable (private mode) — theme still applies for this session.
  }
};

// Light/Dark display mode — an independent axis layered on top of the color template.
export type ThemeMode = 'light' | 'dark';

export const MODE_STORAGE_KEY = 'reams-ui-mode';
export const DEFAULT_MODE: ThemeMode = 'light';

export const getSavedMode = (): ThemeMode => {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'dark' ? 'dark' : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
};

export const applyMode = (mode: ThemeMode) => {
  if (mode === 'dark') {
    document.documentElement.setAttribute('data-mode', 'dark');
  } else {
    document.documentElement.removeAttribute('data-mode');
  }

  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable — mode still applies for this session.
  }
};
