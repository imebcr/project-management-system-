'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Champ « saisir ou choisir » : on tape librement, ou on choisit parmi les suggestions
 * (ex. fournisseur d'hébergement, type de serveur). Même style que <Select>.
 */
export function Combobox({ value, onChange, suggestions, placeholder, autoFocus, 'aria-label': ariaLabel }: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  autoFocus?: boolean;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [filtering, setFiltering] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const unique = Array.from(new Set(suggestions.map((s) => s.trim()).filter(Boolean)));
  const term = value.trim().toLowerCase();
  // Au clic, toutes les suggestions ; pendant la saisie, celles qui correspondent.
  const shown = filtering && term ? unique.filter((s) => s.toLowerCase().includes(term)) : unique;
  const exact = unique.some((s) => s.toLowerCase() === term);

  const place = useCallback(() => {
    const r = input.current?.getBoundingClientRect();
    if (!r) return;
    const room = window.innerHeight - r.bottom;
    const up = room < 220 && r.top > room;
    setPos(up ? { left: r.left, bottom: window.innerHeight - r.top + 6, width: r.width } : { left: r.left, top: r.bottom + 6, width: r.width });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place, shown.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!input.current?.parentElement?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) place(); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setFiltering(false);
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => { onChange(e.target.value); setFiltering(true); setActive(0); setOpen(true); }}
        onFocus={() => { setFiltering(false); setOpen(true); }}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="!pr-9"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Afficher les suggestions"
        onClick={() => { setFiltering(false); setOpen((o) => !o); input.current?.focus(); }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-navy/40 hover:text-brand"
      >
        <ChevronDown size={16} className={cn('transition-transform', open && 'rotate-180 text-brand')} />
      </button>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (shown.length > 0 || (term && !exact)) && (
            <motion.ul
              ref={list}
              id={listId}
              role="listbox"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              style={pos}
              className="fixed z-[200] max-h-60 overflow-y-auto overscroll-contain rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-xl shadow-ocean/15 backdrop-blur-2xl"
            >
              {shown.map((s, i) => {
                const selected = s.toLowerCase() === term;
                return (
                  <li
                    key={s}
                    role="option"
                    aria-selected={selected}
                    onPointerEnter={() => setActive(i)}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                    className={cn('flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-navy', i === active && 'bg-brand/10', selected && 'font-semibold text-ocean')}
                  >
                    <span className="flex-1 truncate">{s}</span>
                    {selected && <Check size={15} className="text-brand" />}
                  </li>
                );
              })}
              {term && !exact && (
                <li
                  role="option"
                  aria-selected={false}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => pick(value.trim())}
                  className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-brand hover:bg-brand/10"
                >
                  <Plus size={14} /> Utiliser « {value.trim()} »
                </li>
              )}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
