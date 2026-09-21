type P = { className?: string };
const base = "h-4 w-4";

export const Ico = {
  Mic: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
    </svg>
  ),
  MicOff: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9v3a3 3 0 0 0 5 2.2M15 12V5a3 3 0 0 0-6 0v1" />
      <path d="M5 10a7 7 0 0 0 10.5 6M19 10v1M12 19v3M3 3l18 18" />
    </svg>
  ),
  Cam: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="m22 8-7 4 7 4V8Z" />
    </svg>
  ),
  CamOff: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6h11a2 2 0 0 1 2 2v8M15 12l7-4v8l-4-2.3M3 3l18 18M2 8v8a2 2 0 0 0 2 2h9" />
    </svg>
  ),
  Vol: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  VolOff: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </svg>
  ),
  Pin: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
    </svg>
  ),
  Play: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5Z" /></svg>
  ),
  Stop: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
  ),
  Focus: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    </svg>
  ),
  Trash: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  ),
  Plus: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
  ),
  Grid: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Copy: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  ),
  Bolt: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
  ),
  Expand: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  ),
  Shrink: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5" />
    </svg>
  ),
  External: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
    </svg>
  ),
  X: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
  ),
  Up: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
  ),
  Down: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
  ),
  Layers: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round"><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></svg>
  ),
  Monitor: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
    </svg>
  ),
  Refresh: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" />
    </svg>
  ),
  Sidebar: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M5.5 8h1M5.5 11h1M5.5 14h1" />
    </svg>
  ),
  Minus: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14" /></svg>
  ),
  Clock: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  Users: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-3-5" /></svg>
  ),
  Download: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></svg>
  ),
  Search: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
  ),
  Info: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></svg>
  ),
  Check: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
  ),
  Notes: ({ className = base }: P) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H5v18h14V8l-5-5ZM14 3v5h5M8 12h8M8 16h6" /></svg>
  ),
};
