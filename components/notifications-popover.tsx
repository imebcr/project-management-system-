'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlarmClock, Bell, CalendarClock, CheckCheck, DatabaseBackup, FileUp, Globe, KeyRound, ListChecks, MessageSquare, MessagesSquare, StickyNote, Sunrise } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cardSpring } from '@/lib/motion';
import { useStore } from '@/lib/store';
import type { AppNotification } from '@/lib/types';
import { cn, isRead, isRecipient, relDays } from '@/lib/utils';

const kindIcon: Record<AppNotification['kind'], typeof Bell> = {
  task: ListChecks, mention: MessageSquare, deadline: AlarmClock, note: StickyNote, feedback: MessagesSquare,
  deliverable: FileUp, expiry: Globe, backup: DatabaseBackup, vault: KeyRound, summary: Sunrise, meeting: CalendarClock,
};

/** Cloche de l'en-tête : ouvre une carte flottante défilante (plus de page Notifications). */
export function NotificationsPopover() {
  const { state, me, markRead, markAllRead } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = state.notifications.filter((n) => isRecipient(me, n.audience));
  const unread = list.filter((n) => !isRead(n, me.id)).length;

  // Fermeture : clic à l'extérieur, Échap, changement de page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  const openItem = (n: AppNotification) => {
    if (!isRead(n, me.id)) markRead(n.id);
    setOpen(false);
    if (n.href) router.push(n.href);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread ? `Notifications, ${unread} non lue(s)` : 'Notifications'}
        className={cn('glass-sm relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/60', open ? 'text-brand' : 'text-navy/60')}
      >
        <Bell size={19} />
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread > 99 ? '99+' : unread}</span>}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={cardSpring}
            className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(70vh,520px)] w-[min(380px,calc(100vw-2rem))] origin-top-right flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/90 shadow-xl shadow-ocean/10 backdrop-blur-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-navy/5 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-navy">Notifications</div>
                <div className="text-[11px] text-navy/45">{unread ? `${unread} non lue(s)` : 'Tout est lu'}</div>
              </div>
              <button
                type="button"
                disabled={!unread}
                onClick={markAllRead}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand/10 disabled:cursor-default disabled:text-navy/30 disabled:hover:bg-transparent"
              >
                <CheckCheck size={14} /> Tout lire
              </button>
            </div>

            {list.length ? (
              <ul className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-2">
                {list.map((n) => {
                  const read = isRead(n, me.id);
                  const Icon = kindIcon[n.kind] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={cn('flex w-full items-start gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-brand/5', !read && 'bg-brand/[0.06]')}
                      >
                        <div className={cn('shrink-0 rounded-lg p-1.5', read ? 'bg-navy/5 text-navy/40' : 'bg-brand/15 text-brand')}><Icon size={16} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={cn('truncate text-sm text-navy', read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                            {!read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Non lue" />}
                          </div>
                          {n.body && <div className="line-clamp-2 text-xs text-navy/50">{n.body}</div>}
                          <div className="mt-0.5 text-[10px] text-navy/35">{relDays(n.date)}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell size={28} className="text-navy/20" />
                <div className="text-sm font-medium text-navy/50">Aucune notification</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
