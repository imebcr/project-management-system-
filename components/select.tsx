'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Liste déroulante au style de l'application (verre dépoli), à la place du <select> natif
 * dont le menu ouvert est dessiné par le système et ne peut pas être stylé.
 * Même usage qu'un <select> : <Select value onChange={(e) => e.target.value}> + <option>.
 */

interface Opt {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
}

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

function collect(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>;
    if (el.type === Fragment) return void collect(el.props.children, out);
    if (el.type === 'option') {
      const text = textOf(el.props.children);
      out.push({ value: el.props.value != null ? String(el.props.value) : text, label: el.props.children, text, disabled: !!el.props.disabled });
    }
  });
  return out;
}

export interface SelectProps {
  value?: string | number;
  onChange?: (e: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
  'aria-label'?: string;
  placeholder?: string;
}

export function Select({ value, onChange, children, disabled, className, id, placeholder, ...rest }: SelectProps) {
  const options = collect(children);
  const current = options.find((o) => o.value === String(value ?? '')) ?? (value == null || value === '' ? options.find((o) => o.value === '') : undefined);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const typed = useRef({ text: '', at: 0 });

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const room = window.innerHeight - r.bottom;
    const height = Math.min(288, options.length * 40 + 12);
    const up = room < height + 12 && r.top > room;
    const width = Math.max(r.width, 180);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos(up ? { left, bottom: window.innerHeight - r.top + 6, width } : { left, top: r.bottom + 6, width });
  }, [options.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
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

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const show = () => {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((o) => o === current)));
    setOpen(true);
  };
  const choose = (o: Opt) => {
    if (o.disabled) return;
    setOpen(false);
    trigger.current?.focus();
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value } });
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); return; } // ne ferme pas la fenêtre autour
    if (e.key === 'Tab') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => step(a, 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => step(a, -1)); return; }
    if (e.key === 'Home') { e.preventDefault(); setActive(step(-1, 1)); return; }
    if (e.key === 'End') { e.preventDefault(); setActive(step(options.length, -1)); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) choose(options[active]); return; }
    if (e.key.length === 1) {
      // Saisie rapide : aller à l'option qui commence par les lettres tapées.
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
      const i = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={rest['aria-label']}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={cn('field flex items-center justify-between gap-2 text-left', open && 'field-open', className)}
      >
        <span className={cn('min-w-0 flex-1 truncate', !current && 'text-navy/40')}>{current ? current.label : placeholder ?? '—'}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-navy/40 transition-transform', open && 'rotate-180 text-brand')} />
      </button>
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.ul
              ref={list}
              id={listId}
              role="listbox"
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              style={pos}
              className="fixed z-[200] max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-white/80 bg-white/95 p-1.5 shadow-xl shadow-ocean/15 backdrop-blur-2xl"
            >
              {options.map((o, i) => {
                const selected = o === current;
                return (
                  <li
                    key={`${o.value}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={o.disabled}
                    onPointerEnter={() => !o.disabled && setActive(i)}
                    onClick={() => choose(o)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-navy transition-colors',
                      i === active && !o.disabled && 'bg-brand/10',
                      selected && 'font-semibold text-ocean',
                      o.disabled && 'cursor-default opacity-40',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {selected && <Check size={15} className="shrink-0 text-brand" />}
                  </li>
                );
              })}
              {!options.length && <li className="px-3 py-2 text-sm text-navy/40">Aucun choix</li>}
            </motion.ul>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
