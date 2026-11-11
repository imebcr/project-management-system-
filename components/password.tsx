'use client';

import { Check, Eye, EyeOff, X } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { passwordRules } from '@/lib/auth';
import { cn } from '@/lib/utils';

export function PasswordInput({ value, onChange, placeholder, autoComplete = 'current-password', autoFocus, id }: { value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; autoFocus?: boolean; id?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="!pr-10"
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-navy/40 hover:bg-white/60 hover:text-navy"
      >
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-live="polite">
      {passwordRules.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.label} className={cn('flex items-center gap-1.5 text-[11px] font-medium', ok ? 'text-emerald-700' : 'text-navy/45')}>
            {ok ? <Check size={12} /> : <X size={12} />} {r.label}
          </li>
        );
      })}
    </ul>
  );
}

/** Carte centrée utilisée par les écrans hors application (connexion, invitation, changement forcé). */
export function AuthCard({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: React.ReactNode }) {
  return (
    <main className="relative z-10 flex min-h-screen items-center justify-center p-4">
      <div className="glass w-full max-w-md rounded-3xl p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="Zidny" width={1200} height={463} priority className="h-11 w-auto" />
          <span className="mt-1.5 block text-[11px] font-medium text-navy/45">Projets · R&amp;D Développement</span>
        </div>
        <h1 className="text-xl font-bold text-navy">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-navy/50">{subtitle}</div>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
