import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { MegaprintLoginLogo } from './BrandLogo';

interface LoginViewProps {
  logoDataUrl?: string;
  companyName?: string;
  signingIn: boolean;
  authError: string | null;
  onSignInWithEmail: (email: string, password: string) => Promise<void>;
  onSignInWithGoogle: () => Promise<void>;
  onSendPasswordReset: (email: string) => Promise<boolean>;
  onClearError: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  logoDataUrl,
  companyName = 'Megaprint',
  signingIn,
  authError,
  onSignInWithEmail,
  onSignInWithGoogle,
  onSendPasswordReset,
  onClearError,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetNotice, setResetNotice] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetNotice('');
    await onSignInWithEmail(email, password);
  };

  const handleReset = async () => {
    setResetNotice('');
    const sent = await onSendPasswordReset(email);
    if (sent) {
      setResetNotice(
        `Password reset link sent to ${email.trim()}. Check your inbox.`
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f4f6] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-[430px] bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        {/* Warm Gold Top Accent Bar */}
        <div className="h-1.5 w-full bg-[#c5a049]" />

        <div className="px-7 pt-8 pb-8 sm:px-9">
          {/* Brand Logo Lockup */}
          <div className="flex justify-center">
            <MegaprintLoginLogo
              logoDataUrl={logoDataUrl}
              companyName={companyName}
            />
          </div>

          <p className="mt-5 mb-6 text-center text-[15px] text-slate-600">
            Sign in to your business workspace
          </p>

          {authError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 leading-relaxed">
              {authError}
            </div>
          )}

          {resetNotice && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700 leading-relaxed">
              {resetNotice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (authError) onClearError();
                }}
                placeholder="megaprintmedia@gmail.com"
                className="w-full rounded-lg bg-[#e8f0fe] border border-slate-200/80 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#136e66]/30 focus:border-[#136e66]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-slate-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-[11px] font-medium text-[#136e66] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (authError) onClearError();
                  }}
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-[#e8f0fe] border border-slate-200/80 pl-3.5 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#136e66]/30 focus:border-[#136e66]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-800"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={signingIn}
              className="w-full py-2.5 px-4 rounded-lg bg-[#136e66] hover:bg-[#0e5750] text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              {signingIn ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Subtle Divider + Google SSO */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-medium text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={() => {
              setResetNotice('');
              onSignInWithGoogle();
            }}
            disabled={signingIn}
            className="w-full py-2.5 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>
      </div>
    </div>
  );
};
