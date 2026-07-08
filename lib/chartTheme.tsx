import React, { useEffect, useState } from 'react';

// Chart colors are read from the active theme's CSS variables so every chart
// follows the user's selected color template and light/dark mode. The AM/PM
// series pairs were validated (CVD + contrast) against light and dark surfaces;
// the light members carry a contrast warning that is relieved by the legend,
// direct value labels, and tooltips rendered with every chart.
const readVar = (name: string) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `rgb(${raw})` : '#6366F1';
};

export const useChartTheme = () => {
  const compute = () => {
    const dark = document.documentElement.getAttribute('data-mode') === 'dark';
    return {
      dark,
      seriesAm: readVar(dark ? '--acc-400' : '--acc-600'),
      seriesPm: readVar(dark ? '--acc-600' : '--acc-300'),
      accent: readVar(dark ? '--acc-400' : '--acc-600'),
      tick: readVar('--neu-500'),
      grid: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
      cursor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      label: readVar('--neu-600'),
      surface: readVar('--surface')
    };
  };

  const [colors, setColors] = useState(compute);

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(compute()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });
    return () => observer.disconnect();
  }, []);

  return colors;
};

export const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[rgb(var(--ink)/0.10)] bg-card px-3 py-2 shadow-md">
      {label && <p className="mb-1 text-[11px] font-medium text-slate-900">{label}</p>}
      {payload.map((entry: any) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <span
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ backgroundColor: entry.color || entry.fill || entry.payload?.fill }}
          />
          {entry.name}: <span className="font-mono text-slate-900">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};
