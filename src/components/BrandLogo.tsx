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
            Media Solutions
          </div>
        </div>
      )}
    </div>
  );
};

export const MegaprintLoginLogo: React.FC<{
  logoDataUrl?: string;
  companyName?: string;
}> = ({ logoDataUrl, companyName = 'Megaprint' }) => {
  if (logoDataUrl) {
    return (
      <div className="flex flex-col items-center justify-center">
        <img
          src={logoDataUrl}
          alt={`${companyName} logo`}
          referrerPolicy="no-referrer"
          className="max-h-36 w-auto object-contain mx-auto"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center select-none" aria-label="Megaprint Media Solutions — Your Complete Branding Partner">
      {/* Navy Serif M with Red & White Orbital Swoosh */}
      <svg
        viewBox="0 0 280 128"
        className="w-48 h-auto"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Megaprint M emblem"
      >
        <defs>
          <linearGradient id="mpNavyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0E2E7A" />
            <stop offset="100%" stopColor="#07184A" />
          </linearGradient>
          <filter id="ringShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" floodColor="#0F172A" floodOpacity="0.22" />
          </filter>
        </defs>

        {/* Back upper red arc of the orbital ring */}
        <path
          d="M 52 54 C 46 28, 108 16, 174 28 C 224 38, 240 58, 224 72"
          fill="none"
          stroke="#E10A17"
          strokeWidth="6.5"
          strokeLinecap="round"
        />

        {/* Classic bold serif M */}
        <path
          d="M 56 112 L 56 105 C 66 104 69 101 70 92 L 77 32 C 78 23 74 20 65 19 L 65 13 L 106 13 L 141 79 L 176 13 L 216 13 L 216 19 C 207 20 203 23 204 32 L 211 92 C 212 101 215 104 225 105 L 225 112 L 175 112 L 175 105 C 185 104 188 101 187 92 L 182 36 L 143 108 L 136 108 L 97 36 L 92 92 C 91 101 94 104 104 105 L 104 112 Z"
          fill="url(#mpNavyGrad)"
        />

        {/* Front lower crisp white arc crossing over the M */}
        <path
          d="M 52 54 C 50 76, 108 98, 174 92 C 216 88, 234 78, 224 72"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="6.5"
          strokeLinecap="round"
          filter="url(#ringShadow)"
        />
      </svg>

      {/* MEGAPRINT Wordmark */}
      <div className="mt-1 font-display font-extrabold text-[30px] leading-none tracking-wide uppercase">
        <span className="text-[#09205E]">MEGA</span>
        <span className="text-[#E10A17]">PRINT</span>
      </div>

      {/* Red Rules + MEDIA SOLUTIONS */}
      <div className="mt-1.5 flex items-center justify-center gap-2.5 w-full max-w-[260px]">
        <span className="h-[1.5px] flex-1 bg-[#E10A17]" />
        <span className="text-[11px] font-bold tracking-[0.18em] text-[#111827] uppercase whitespace-nowrap">
          MEDIA SOLUTIONS
        </span>
        <span className="h-[1.5px] flex-1 bg-[#E10A17]" />
      </div>

      {/* Tagline: Your Complete Branding Partner */}
      <div className="mt-1 text-[17px] italic font-semibold tracking-tight leading-snug">
        <span className="text-[#09205E]">Your Complete </span>
        <span className="text-[#E10A17]">Branding Partner</span>
      </div>
    </div>
  );
};
