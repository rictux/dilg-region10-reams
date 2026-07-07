import React from 'react';

/** Left branding panel shared by the Login and Signup pages. */
const AuthBrandPanel: React.FC = () => (
  <div className="hidden lg:flex lg:w-[45%] bg-sidebar flex-col justify-between p-12 relative overflow-hidden">
    {/* Grid texture */}
    <div
      className="absolute inset-0 opacity-[0.03]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    />
    {/* Accent glow */}
    <div className="absolute top-1/3 -left-24 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

    <div className="relative">
      <div className="flex items-center gap-3 mb-16">
        <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center overflow-hidden">
          <img src="/assets/dilg_logo.png" alt="DILG Logo" className="w-full h-full object-contain rounded-full" />
        </div>
        <span className="text-white text-base font-medium tracking-wide font-mono">REAMS</span>
      </div>

      <div>
        <h1 className="text-4xl font-semibold text-white leading-tight mb-4">
          Manage events<br />with precision.
        </h1>
        <p className="text-white/45 text-base leading-relaxed max-w-xs">
          Regional Event &amp; Attendance Management System — a complete portal for event
          registration, attendance tracking, and participant management.
        </p>
      </div>
    </div>

    {/* Footer strip */}
    <div className="relative pt-8 border-t border-white/[0.08]">
      <p className="text-xs text-white/35">
        Department of the Interior and Local Government
      </p>
      <p className="text-xs text-white/25 mt-1 font-mono">
        © 2026 · Created by RICTU X
      </p>
    </div>
  </div>
);

export default AuthBrandPanel;
