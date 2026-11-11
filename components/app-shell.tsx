'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock, ChevronsUpDown, CircleUserRound, FolderKanban, LayoutDashboard, ListChecks, LogOut, Server, ShieldCheck, UserCog } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { isStrongPassword } from '@/lib/auth';
import { useStore } from '@/lib/store';
import { cardSpring } from '@/lib/motion';
import { cn, isAdmin, isDev, rolesLabel } from '@/lib/utils';
import { NotificationsPopover } from './notifications-popover';
import { AuthCard, PasswordInput, PasswordRules } from './password';
import { Avatar, Button, ErrorNote, Field } from './ui';

/** Onglets selon les rôles (cumulables). Les notifications s'ouvrent dans une carte depuis la cloche de l'en-tête. */
const adminNav = [
  { href: '/', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard },
  { href: '/projects', label: 'Projets', short: 'Projets', icon: FolderKanban },
  { href: '/agenda', label: 'Calendrier', short: 'Agenda', icon: CalendarClock },
  { href: '/servers', label: 'Serveurs', short: 'Serveurs', icon: Server },
  { href: '/admin', label: 'Administration', short: 'Admin', icon: ShieldCheck },
  { href: '/account', label: 'Profil', short: 'Profil', icon: CircleUserRound },
];

const devNav = [
  { href: '/', label: 'Accueil', short: 'Accueil', icon: LayoutDashboard },
  { href: '/projects', label: 'Projets', short: 'Projets', icon: FolderKanban },
  { href: '/tasks', label: 'Mes tâches', short: 'Tâches', icon: ListChecks },
  { href: '/agenda', label: 'Calendrier', short: 'Agenda', icon: CalendarClock },
  { href: '/account', label: 'Profil', short: 'Profil', icon: CircleUserRound },
];

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Logo Zidny (public/logo.png, 1200 × 463). */
function Logo({ className }: { className?: string }) {
  return <Image src="/logo.png" alt="Zidny" width={1200} height={463} priority className={cn('h-8 w-auto', className)} />;
}

function AccountMenu({ up = true }: { up?: boolean }) {
  const { me, logout } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="glass-sm flex w-full items-center gap-2 rounded-xl p-2 text-left transition-colors hover:bg-white/50">
        <Avatar userId={me.id} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-navy">{me.name}</span>
          <span className="block truncate text-[11px] text-navy/45">{me.email}</span>
        </span>
        <ChevronsUpDown size={14} className="text-navy/40" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: up ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: up ? 6 : -6 }} transition={cardSpring}
            className={cn('absolute left-0 right-0 z-40 rounded-2xl border border-white/70 bg-white/90 p-1.5 shadow-xl backdrop-blur-2xl', up ? 'bottom-full mb-2' : 'top-full mt-2')}
          >
            <div className="px-2 py-1 text-[11px] text-navy/45">{rolesLabel(me)} · {me.department}</div>
            <Link href="/account" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-navy hover:bg-brand/10">
              <UserCog size={16} className="text-brand" /> Mon compte
            </Link>
            <button onClick={() => { logout(); router.replace('/login'); }} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-medium text-red-500 hover:bg-red-50">
              <LogOut size={16} /> Se déconnecter
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Q5 : mot de passe temporaire → changement obligatoire avant d'accéder à l'application. */
function ForcedPasswordChange() {
  const { me, changePassword, logout } = useStore();
  const router = useRouter();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    const r = await changePassword(null, next);
    setBusy(false);
    if (!r.ok) setError(r.error);
  };

  return (
    <AuthCard title="Choisissez votre mot de passe" subtitle={<>Bienvenue {me.name.split(' ')[0]}. Votre mot de passe temporaire doit être remplacé avant de continuer.</>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nouveau mot de passe"><PasswordInput value={next} onChange={(v) => { setNext(v); setError(null); }} autoComplete="new-password" autoFocus /></Field>
        <PasswordRules value={next} />
        <Field label="Confirmation"><PasswordInput value={confirm} onChange={(v) => { setConfirm(v); setError(null); }} autoComplete="new-password" /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" className="w-full" disabled={busy || !isStrongPassword(next) || !confirm}>Enregistrer et continuer</Button>
        <button type="button" onClick={() => { logout(); router.replace('/login'); }} className="w-full text-center text-xs font-semibold text-navy/45 hover:text-navy">Se déconnecter</button>
      </form>
    </AuthCard>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, state } = useStore();
  const signedIn = !!state.currentUserId && !!me && me.active;

  useEffect(() => {
    if (!signedIn) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [signedIn, pathname, router]);

  if (!signedIn) return null;
  if (me.mustChangePassword) return <ForcedPasswordChange />;

  // Admin + Dev : menu admin, plus « Mes tâches » et « Agenda ».
  // Admin + Dev : menu admin, plus « Mes tâches ».
  const items = isAdmin(me) && isDev(me)
    ? [adminNav[0], adminNav[1], devNav[2], ...adminNav.slice(2)]
    : isAdmin(me) ? adminNav : devNav;

  return (
    <>
      {/* Sidebar (desktop) */}
      <aside className="glass-sidebar fixed inset-y-0 left-0 z-30 hidden w-56 flex-col p-4 lg:flex">
        <Link href="/" aria-label="Zidny Projets — accueil" className="mb-8 block px-2">
          <Logo className="h-9" />
          <span className="mt-1.5 block text-[11px] font-medium text-navy/45">Projets · {rolesLabel(me)}</span>
        </Link>
        <nav className="flex-1 space-y-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} className={cn('relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors', active ? 'text-navy' : 'text-navy/50 hover:bg-white/40 hover:text-navy')}>
                {active && <motion.span layoutId="sidebar-active" transition={cardSpring} className="absolute inset-0 rounded-xl bg-white/70 shadow-sm shadow-ocean/10" />}
                <Icon size={18} className={cn('relative', active && 'text-brand')} />
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>
        <AccountMenu />
      </aside>

      {/* Bottom nav (mobile) */}
      <nav className="glass-nav fixed inset-x-0 bottom-0 z-30 flex justify-around px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {items.map(({ href, label, short, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} aria-label={label} className={cn('relative flex min-h-[56px] min-w-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium', active ? 'text-brand' : 'text-navy/45')}>
              {active && <motion.span layoutId="bottom-active" transition={cardSpring} className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />}
              <Icon size={20} />
              {short}
            </Link>
          );
        })}
      </nav>

      <main className="relative z-10 min-h-screen pb-16 lg:pb-0 lg:pl-56">
        {/* En-tête : cloche de notifications (tous les rôles) */}
        <div className="flex items-center justify-between gap-3 px-4 pt-3 lg:justify-end lg:px-6">
          <Link href="/" aria-label="Zidny Projets — accueil" className="lg:hidden">
            <Logo className="h-7" />
          </Link>
          <NotificationsPopover />
        </div>
        {children}
      </main>
    </>
  );
}
