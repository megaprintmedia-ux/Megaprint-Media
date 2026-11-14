import React from 'react';

interface BrandLogoProps {
  logoDataUrl?: string;
  companyName?: string;
  variant?: 'dark' | 'light';
  compact?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  logoDataUrl,
  companyName = 'Megaprint',
  variant = 'dark',
  compact = false,
}) => {
  const textColor = variant === 'dark' ? 'text-white' : 'text-slate-900';
  const subColor = variant === 'dark' ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="flex items-center gap-3 min-w-0">
      {logoDataUrl ? (
        <img
          src={logoDataUrl}
          alt={`${companyName} logo`}
          referrerPolicy="no-referrer"
          className="h-9 w-9 rounded-md object-contain bg-white/95 p-0.5 shrink-0 border border-slate-200/20"
        />
      ) : (
        <div
          className="h-9 w-9 rounded-md bg-blue-600 flex items-center justify-center shrink-0 border border-blue-500"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 32 32"
            className="h-5 w-5 text-white"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 24V8L11.5 17.5L16 11L20.5 17.5L27 8V24"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="4" y="25.5" width="7" height="2" fill="#38BDF8" />
            <rect x="12.5" y="25.5" width="7" height="2" fill="#F43F5E" />
            <rect x="21" y="25.5" width="7" height="2" fill="#FBBF24" />
          </svg>
        </div>
      )}
      {!compact && (
        <div className="min-w-0">
          <div className={`font-display text-base font-bold tracking-tight truncate ${textColor}`}>
            {companyName}
          </div>
          <div className={`text-[11px] truncate ${subColor}`}>
            Print · Brand · Tailoring
          </div>
        </div>
      )}
    </div>
  );
};
