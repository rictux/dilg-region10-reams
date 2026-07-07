import React, { useState } from 'react';
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import {
  THEMES,
  ThemeTemplate,
  ThemeId,
  ThemeMode,
  applyTheme,
  applyMode,
  getSavedThemeId,
  getSavedMode,
  DEFAULT_THEME_ID
} from '../../lib/themes';

const MODES: { id: ThemeMode; name: string; description: string }[] = [
  { id: 'light', name: 'Light', description: 'Bright surfaces, dark text.' },
  { id: 'dark', name: 'Dark', description: 'Soft charcoal surfaces, light text.' }
];

/** Miniature dashboard mockup painted with the template's palette. */
const ThemePreview: React.FC<{ theme: ThemeTemplate }> = ({ theme }) => {
  const { preview } = theme;

  const miniCard = (iconColor: string, iconBg: string) => (
    <div
      className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5"
      style={{ backgroundColor: preview.surface, border: `1px solid ${preview.border}` }}
    >
      <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ backgroundColor: iconBg }}>
        <span className="m-1 block h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: iconColor }} />
      </span>
      <span className="flex-1 space-y-1">
        <span className="block h-1 w-3/4 rounded-full" style={{ backgroundColor: preview.textMuted }} />
        <span className="block h-1 w-1/2 rounded-full" style={{ backgroundColor: preview.border }} />
      </span>
    </div>
  );

  return (
    <div
      className="flex h-32 w-full overflow-hidden rounded-t-[10px]"
      style={{ backgroundColor: preview.background }}
      aria-hidden="true"
    >
      {/* Sidebar strip */}
      <div className="flex w-9 shrink-0 flex-col items-center gap-1.5 py-2" style={{ backgroundColor: preview.sidebar }}>
        <span className="mb-1 h-2.5 w-2.5 rounded-sm bg-white/90" />
        <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: preview.accent }} />
        <span className="h-1.5 w-5 rounded-full bg-white/20" />
        <span className="h-1.5 w-5 rounded-full bg-white/20" />
        <span className="h-1.5 w-5 rounded-full bg-white/20" />
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div
          className="flex h-5 shrink-0 items-center gap-1 px-2"
          style={{ backgroundColor: preview.surface, borderBottom: `1px solid ${preview.border}` }}
        >
          <span className="h-1 w-8 rounded-full" style={{ backgroundColor: preview.textMuted }} />
          <span className="ml-auto h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preview.accentSoft, border: `1px solid ${preview.accent}` }} />
        </div>

        <div className="flex-1 space-y-1.5 p-2">
          {/* Stat cards */}
          <div className="flex gap-1.5">
            {miniCard(preview.accent, preview.accentSoft)}
            {miniCard(preview.textMuted, preview.border)}
          </div>

          {/* Content card with accent progress bar */}
          <div
            className="space-y-1.5 rounded-md p-1.5"
            style={{ backgroundColor: preview.surface, border: `1px solid ${preview.border}` }}
          >
            <span className="block h-1 w-1/3 rounded-full" style={{ backgroundColor: preview.textMuted }} />
            <span className="block h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: preview.background }}>
              <span className="block h-full w-2/3 rounded-full" style={{ backgroundColor: preview.accent }} />
            </span>
            <span className="block h-1 w-1/2 rounded-full" style={{ backgroundColor: preview.border }} />
          </div>
        </div>
      </div>
    </div>
  );
};

const AppearanceSettings: React.FC = () => {
  const [activeThemeId, setActiveThemeId] = useState<ThemeId>(getSavedThemeId);
  const [activeMode, setActiveMode] = useState<ThemeMode>(getSavedMode);

  const handleSelect = (id: ThemeId) => {
    applyTheme(id);
    setActiveThemeId(id);
  };

  const handleSelectMode = (mode: ThemeMode) => {
    applyMode(mode);
    setActiveMode(mode);
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">Appearance</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Choose a display mode and design template for the dashboard. Changes apply instantly across the whole portal.
        </p>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 font-mono">Display Mode</p>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          {MODES.map((mode) => {
            const isActive = mode.id === activeMode;

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelectMode(mode.id)}
                aria-pressed={isActive}
                className={`flex items-center gap-3 rounded-lg border-2 bg-card p-3 text-left transition-all ${
                  isActive
                    ? 'border-indigo-600 ring-2 ring-indigo-600/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    mode.id === 'light'
                      ? 'bg-amber-50 text-amber-600 border border-amber-200'
                      : 'bg-[#404048] text-[#F6F6F8] border border-[#595962]'
                  }`}
                >
                  {mode.id === 'light' ? <Sun size={15} /> : <Moon size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{mode.name}</span>
                  <span className="block text-xs text-slate-500">{mode.description}</span>
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isActive
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 text-transparent'
                  }`}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mb-2 mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 font-mono">Color Template</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {THEMES.map((theme) => {
          const isActive = theme.id === activeThemeId;

          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => handleSelect(theme.id)}
              aria-pressed={isActive}
              className={`group relative overflow-hidden rounded-xl border-2 bg-card text-left shadow-sm transition-all ${
                isActive
                  ? 'border-indigo-600 ring-2 ring-indigo-600/20'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
              }`}
            >
              <ThemePreview theme={theme} />

              <div className="flex items-start gap-3 border-t border-slate-100 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{theme.name}</p>
                    {theme.id === DEFAULT_THEME_ID && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{theme.description}</p>
                </div>

                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    isActive
                      ? 'border-indigo-600 bg-indigo-600 text-white'
                      : 'border-slate-300 bg-card text-transparent group-hover:border-slate-400'
                  }`}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-xs text-slate-500">
          Your mode and template are saved to this browser and device only — other users and devices keep their own
          settings. Certificates, badges, and printed reports always keep their standard light colors.
        </p>
      </div>
    </div>
  );
};

export default AppearanceSettings;
