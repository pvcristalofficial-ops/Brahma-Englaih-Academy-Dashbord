import { useEffect, useRef } from 'react';
import { Loader2, X, Inbox, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

export function Button({ variant = 'secondary', size = 'md', loading, icon: Icon, children, className = '', ...rest }) {
  return (
    <button className={`btn btn-${variant} btn-${size} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

export function LinkButton({ as: As = 'a', variant = 'secondary', size = 'md', icon: Icon, children, className = '', ...rest }) {
  return (
    <As className={`btn btn-${variant} btn-${size} ${className}`} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} />}
      {children}
    </As>
  );
}

export function Field({ label, error, hint, required, children, className = '' }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${className}`}>
      {label && <span className="field-label">{label}{required && <b aria-hidden="true"> *</b>}</span>}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

export const Input = ({ className = '', ...p }) => <input className={`input ${className}`} {...p} />;
export const Textarea = ({ className = '', ...p }) => <textarea className={`input ${className}`} rows={3} {...p} />;
export function Select({ options = [], placeholder, className = '', ...p }) {
  return (
    <select className={`input ${className}`} {...p}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Modal({ open, title, onClose, children, footer, size = 'md', locked = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !locked) onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input,select,textarea,button.btn-primary')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose, locked]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !locked) onClose?.(); }}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose} disabled={locked}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Badge = ({ tone = 'neutral', icon: Icon, children, title }) => (
  <span className={`badge badge-${tone}`} title={title}>{Icon && <Icon size={12} />}{children}</span>
);

const STATUS_TONE = { new: 'blue', follow_up: 'amber', demo_scheduled: 'violet', admitted: 'green', lost: 'red' };
export function StatusBadge({ status, meta }) {
  const label = meta?.statuses?.find((s) => s.value === status)?.label || status;
  return <Badge tone={STATUS_TONE[status] || 'neutral'}>{label}</Badge>;
}
const INT_TONE = { hot: 'red', warm: 'amber', cold: 'blue' };
export const InterestBadge = ({ level }) => <Badge tone={INT_TONE[level] || 'neutral'}>{level ? level[0].toUpperCase() + level.slice(1) : '-'}</Badge>;

export const Spinner = ({ label = 'Loading...' }) => (
  <div className="center-pad" role="status"><Loader2 className="spin" size={22} /><span>{label}</span></div>
);

export const Empty = ({ title = 'Nothing here yet', children, icon: Icon = Inbox }) => (
  <div className="empty"><Icon size={34} /><strong>{title}</strong>{children && <p>{children}</p>}</div>
);

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="error-box" role="alert">
      <AlertTriangle size={18} />
      <div><strong>{error.message}</strong></div>
      {onRetry && <Button size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return meta ? <div className="pager"><span>{meta.total} record{meta.total === 1 ? '' : 's'}</span></div> : null;
  return (
    <div className="pager">
      <span>{meta.total} records - page {meta.page} of {meta.pages}</span>
      <div>
        <Button size="sm" icon={ChevronLeft} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Prev</Button>
        <Button size="sm" disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}>Next <ChevronRight size={14} /></Button>
      </div>
    </div>
  );
}

export const Card = ({ title, action, children, className = '', pad = true }) => (
  <section className={`card ${className}`}>
    {(title || action) && <header className="card-head"><h3>{title}</h3>{action}</header>}
    <div className={pad ? 'card-body' : ''}>{children}</div>
  </section>
);

export const PageHeader = ({ title, subtitle, children }) => (
  <div className="page-head">
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    <div className="page-actions">{children}</div>
  </div>
);

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="tabs" role="tablist">
    {tabs.map((t) => (
      <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? 'active' : ''} ${t.tone || ''}`} onClick={() => onChange(t.value)}>
        {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
      </button>
    ))}
  </div>
);

export function Progress({ value, max, tone = 'blue' }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><span className={`progress-${tone}`} style={{ width: `${pct}%` }} /></div>;
}

export function Confirm({ open, title, children, confirmLabel = 'Confirm', danger, loading, onConfirm, onClose }) {
  return (
    <Modal open={open} title={title} onClose={onClose} size="sm" locked={loading}
      footer={<><Button onClick={onClose} disabled={loading}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      {children}
    </Modal>
  );
}
