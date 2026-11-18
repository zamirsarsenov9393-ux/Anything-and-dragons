/** Базовые элементы интерфейса в стиле тёмного фэнтези. */
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, X } from 'lucide-react';
import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { useApp } from './store';

const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');
export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'gold' | 'ghost' | 'outline' | 'danger' | 'soft'; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode };
export function Button({ variant = 'outline', size = 'md', icon, className, children, ...p }: BtnProps) {
  const v = {
    gold: 'bg-gradient-to-b from-gold-bright to-gold text-ink font-semibold shadow-[0_8px_24px_-12px_rgba(196,160,98,.8)] active:from-gold active:to-gold-soft',
    outline: 'border border-edge bg-coal/60 text-parchment active:bg-slate',
    ghost: 'text-parchment-dim active:bg-slate/70',
    soft: 'bg-slate text-parchment active:bg-edge',
    danger: 'border border-blood/60 text-blood active:bg-blood/10',
  }[variant];
  const s = { sm: 'h-9 px-3 text-sm rounded-lg', md: 'h-11 px-4 rounded-xl', lg: 'h-13 px-5 text-lg rounded-2xl' }[size];
  return (
    <button {...p} className={cx('inline-flex items-center justify-center gap-2 transition select-none disabled:opacity-40 disabled:pointer-events-none', v, s, className)}>
      {icon}{children}
    </button>
  );
}

export function Card({ className, children, gold, onClick }: { className?: string; children: ReactNode; gold?: boolean; onClick?: () => void }) {
  return <div onClick={onClick} className={cx('card', gold && 'card-gold', onClick && 'cursor-pointer active:scale-[.99] transition', className)}>{children}</div>;
}

export function Header({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: string | (() => void); actions?: ReactNode }) {
  const navigate = useApp((s) => s.navigate);
  return (
    <header className="sticky top-0 z-20 safe-top pb-3 px-4 bg-gradient-to-b from-ink via-ink/95 to-ink/0 backdrop-blur-[2px]">
      <div className="flex items-center gap-2 min-h-11">
        {back && (
          <button aria-label="Назад" onClick={() => (typeof back === 'string' ? navigate(back) : back())} className="-ml-2 h-11 w-11 grid place-items-center rounded-full text-gold active:bg-slate">
            <ChevronLeft size={26} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-[28px] leading-tight font-semibold text-parchment truncate">{title}</h1>
          {subtitle && <div className="text-sm text-muted truncate">{subtitle}</div>}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function Section({ title, children, right, className }: { title?: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={cx('mt-5', className)}>
      {title && (
        <div className="flex items-end justify-between mb-2 px-1">
          <h2 className="font-display text-xl text-gold-bright font-semibold">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode; badge?: number }[] }) {
  return (
    <div className="scroll-x -mx-4 px-4">
      <div className="flex gap-2 w-max">
        {items.map((it) => (
          <button key={it.id} onClick={() => onChange(it.id)}
            className={cx('h-9 px-3.5 rounded-full text-sm border transition whitespace-nowrap', value === it.id ? 'bg-gold text-ink border-gold font-semibold' : 'border-edge text-parchment-dim bg-coal/50')}>
            {it.label}{it.badge ? <span className={cx('ml-1.5 inline-grid place-items-center min-w-5 h-5 px-1 rounded-full text-[11px]', value === it.id ? 'bg-ink/20' : 'bg-blood text-parchment')}>{it.badge}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx('grid gap-1 p-1 rounded-xl bg-coal border border-edge', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((it) => (
        <button key={String(it.id)} onClick={() => onChange(it.id)} className={cx('h-10 rounded-lg text-sm transition', value === it.id ? 'bg-slate text-gold-bright font-semibold shadow-inner' : 'text-parchment-dim')}>{it.label}</button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-[13px] text-muted mb-1.5 px-1">{label}</div>
      {children}
      {hint && <div className="text-xs text-muted mt-1 px-1">{hint}</div>}
    </label>
  );
}
export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx('w-full h-12 px-4 rounded-xl bg-coal border border-edge text-parchment placeholder:text-muted/70 outline-none focus:border-gold-soft', p.className)} />;
}
export function TextArea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx('w-full min-h-28 p-4 rounded-xl bg-coal border border-edge text-parchment placeholder:text-muted/70 outline-none focus:border-gold-soft', p.className)} />;
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx('w-full h-12 px-4 rounded-xl bg-coal border border-edge text-parchment outline-none focus:border-gold-soft appearance-none', p.className)} />;
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'gold' | 'warn' | 'error' | 'ok' }) {
  const t = { muted: 'border-edge text-muted', gold: 'border-gold-soft text-gold', warn: 'border-gold-soft/60 text-gold-bright bg-gold/10', error: 'border-blood/60 text-blood bg-blood/10', ok: 'border-moss/60 text-moss' }[tone];
  return <span className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] uppercase tracking-wide whitespace-nowrap', t)}>{children}</span>;
}

export function Drawer({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/70" onClick={onClose} />
          <motion.div role="dialog" className="absolute inset-x-0 bottom-0 max-h-[88vh] flex flex-col rounded-t-3xl bg-graphite border-t border-gold-soft/40 safe-bottom mx-auto max-w-xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
            <div className="flex items-center gap-2 px-5 pt-4 pb-2">
              <div className="flex-1 font-display text-2xl text-gold-bright font-semibold">{title}</div>
              <button aria-label="Закрыть" onClick={onClose} className="h-10 w-10 grid place-items-center rounded-full text-muted active:bg-slate"><X size={22} /></button>
            </div>
            <div className="overflow-y-auto px-5 pb-4">{children}</div>
            {footer && <div className="px-5 pt-2 pb-2 border-t border-edge">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      {icon && <div className="mx-auto mb-4 w-16 h-16 grid place-items-center rounded-full border border-gold-soft/40 text-gold">{icon}</div>}
      <div className="font-display text-2xl text-parchment">{title}</div>
      {text && <p className="text-muted mt-2 text-sm leading-relaxed">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Stepper({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-edge bg-coal">
      <button className="h-11 w-11 text-xl text-gold disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <div className="w-10 text-center font-display text-2xl">{value}</div>
      <button className="h-11 w-11 text-xl text-gold disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="fixed inset-x-0 top-0 safe-top z-[60] flex flex-col items-center gap-2 pointer-events-none px-4 pt-14">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            className={cx('px-4 py-3 rounded-xl text-sm max-w-md shadow-xl border', t.tone === 'error' ? 'bg-[#2a1612] border-blood/60 text-parchment' : t.tone === 'warn' ? 'bg-[#2a2314] border-gold-soft text-parchment' : 'bg-slate border-edge text-parchment')}>
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Круглый значок характеристики, как на листе персонажа. */
export function StatBox({ label, value, sub, onClick, accent }: { label: ReactNode; value: ReactNode; sub?: ReactNode; onClick?: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} className={cx('card flex flex-col items-center justify-center py-2.5 px-1 min-h-[84px] active:scale-[.98] transition', accent && 'card-gold')}>
      <div className="text-[11px] uppercase tracking-[.12em] text-muted">{label}</div>
      <div className="font-display text-[30px] leading-none mt-1 text-parchment">{value}</div>
      {sub && <div className="text-xs text-gold mt-1">{sub}</div>}
    </button>
  );
}
