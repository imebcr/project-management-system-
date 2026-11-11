'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Code2, Palette, X } from 'lucide-react';
import { useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { cardHover, cardSpring, modalSpring, pageTransition } from '@/lib/motion';
import { cn, initials, toneClass } from '@/lib/utils';

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon' | 'icon-danger';

const variantClass: Record<Variant, string> = {
  primary: 'bg-brand hover:bg-ocean active:scale-[0.98] text-white font-semibold rounded-xl shadow-md shadow-brand/25 px-4 py-2',
  secondary: 'bg-white/60 hover:bg-white/90 active:scale-[0.98] border border-white/80 text-navy font-semibold rounded-xl shadow-sm shadow-ocean/10 backdrop-blur px-4 py-2',
  danger: 'bg-red-500 hover:bg-red-600 active:scale-[0.98] text-white font-semibold rounded-xl shadow-md shadow-red-500/25 px-4 py-2',
  ghost: 'text-navy/60 hover:text-navy hover:bg-white/50 rounded-xl px-3 py-2 font-medium',
  icon: 'text-navy/50 hover:text-brand hover:bg-white/70 rounded-xl p-2',
  'icon-danger': 'text-navy/40 hover:text-red-500 hover:bg-red-50/80 rounded-xl p-2',
};

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[36px] items-center justify-center gap-2 text-sm transition-all disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:active:scale-100',
        variantClass[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------- Badges & meters ----------

export function Badge({ tone, children, className }: { tone: keyof typeof toneClass; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', toneClass[tone], className)}>{children}</span>;
}

export function MetaBadge({ meta }: { meta: [string, keyof typeof toneClass] }) {
  return <Badge tone={meta[1]}>{meta[0]}</Badge>;
}

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'amber' | 'red' | 'green' }) {
  const bg = { brand: 'bg-brand', amber: 'bg-amber-400', red: 'bg-red-500', green: 'bg-emerald-500' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-navy/10', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className={cn('h-full rounded-full', bg)} initial={{ width: 0 }} animate={{ width: `${Math.min(100, value)}%` }} transition={pageTransition} />
    </div>
  );
}

export function ProgressRing({ value, size = 56 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={5} className="fill-none stroke-navy/10" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} strokeWidth={5} strokeLinecap="round" className="fill-none stroke-brand"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (c * value) / 100 }} transition={pageTransition}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-navy">{value}%</span>
    </div>
  );
}

// ---------- People ----------

const avatarColors = ['bg-brand', 'bg-ocean', 'bg-navy', 'bg-sky-400', 'bg-cyan-600', 'bg-indigo-500'];

/** Métier du membre (Dev ou Design), affiché à côté de son nom pour distinguer les profils. */
export function DeptBadge({ department, className }: { department?: string; className?: string }) {
  if (!department) return null;
  const design = department === 'Design';
  return (
    <span
      title={department}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-px text-[10px] font-bold uppercase tracking-wide',
        design ? 'bg-fuchsia-500/12 text-fuchsia-700 ring-1 ring-fuchsia-500/20' : 'bg-brand/12 text-ocean ring-1 ring-brand/20',
        className,
      )}
    >
      {design ? <Palette size={10} /> : <Code2 size={10} />}
      {design ? 'Design' : 'Dev'}
    </span>
  );
}

export function Avatar({ userId, size = 28 }: { userId: string; size?: number }) {
  const { state } = useStore();
  const u = state.users.find((x) => x.id === userId);
  const idx = Number(userId.replace(/\D/g, '')) % avatarColors.length || 0;
  return (
    <span
      title={u?.name}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ring-white/80', avatarColors[idx])}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {u ? initials(u.name) : '?'}
    </span>
  );
}

export function AvatarStack({ ids, max = 3, size = 24 }: { ids: string[]; max?: number; size?: number }) {
  return (
    <div className="flex -space-x-2">
      {ids.slice(0, max).map((id) => <Avatar key={id} userId={id} size={size} />)}
      {ids.length > max && (
        <span className="inline-flex items-center justify-center rounded-full bg-silver text-[10px] font-bold text-navy ring-2 ring-white/80" style={{ width: size, height: size }}>
          +{ids.length - max}
        </span>
      )}
    </div>
  );
}

// ---------- Layout pieces ----------

export function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={pageTransition}>
      {children}
    </motion.div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/50 bg-white/20 px-6 py-5 backdrop-blur-sm">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-navy">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-navy/45">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ children, className, hover, onClick }: { children: ReactNode; className?: string; hover?: boolean; onClick?: () => void }) {
  return (
    <motion.div
      whileHover={hover ? cardHover : undefined}
      transition={cardSpring}
      onClick={onClick}
      className={cn('glass rounded-2xl p-4', onClick && 'cursor-pointer', className)}
    >
      {children}
    </motion.div>
  );
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-xs font-medium uppercase tracking-wide text-navy/50">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card hover className="flex items-start justify-between">
      <div>
        <div className="text-xs font-medium text-navy/50">{label}</div>
        <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-navy/45">{hint}</div>}
      </div>
      {icon && <div className="rounded-xl bg-brand/10 p-2 text-brand">{icon}</div>}
    </Card>
  );
}

export function Empty({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="glass-sm flex flex-col items-center rounded-2xl px-6 py-10 text-center">
      <div className="mb-3 rounded-2xl bg-white/60 p-3 text-brand">{icon}</div>
      <div className="text-sm font-semibold text-navy">{title}</div>
      {hint && <div className="mt-1 max-w-xs text-xs text-navy/45">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-navy/50">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-navy/40">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm text-navy">
      <span className={cn('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-navy/15')}>
        <motion.span layout transition={cardSpring} className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', checked ? 'right-0.5' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  const id = useId();
  return (
    <div className="glass-sm inline-flex rounded-xl p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('relative rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', value === o.value ? 'text-white' : 'text-navy/50 hover:text-navy')}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} transition={cardSpring} className="absolute inset-0 rounded-lg bg-brand shadow-sm shadow-brand/25" />}
          <span className="relative flex items-center gap-1">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Rendu à la racine de la page (portail) : une fenêtre ouverte depuis une carte animée
  // ne doit jamais rester enfermée dans cette carte, ni passer sous les cartes suivantes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy/30 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={modalSpring}
            className={cn('relative flex max-h-[90vh] w-full flex-col rounded-t-3xl border border-white/70 bg-white/90 shadow-2xl shadow-ocean/10 backdrop-blur-2xl sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
          >
            <div className="flex items-center justify-between border-b border-white/60 px-5 py-4">
              <h2 className="font-bold text-navy">{title}</h2>
              <Button variant="icon" onClick={onClose} aria-label="Fermer">
                <X size={18} />
              </Button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-white/60 px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs font-medium text-red-600">{children}</div>;
}

/** Confirmation éphémère en bas de l'écran (ex. « Lien copié »). */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16 }}
          transition={modalSpring}
          className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-xl shadow-navy/20 lg:bottom-8"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
