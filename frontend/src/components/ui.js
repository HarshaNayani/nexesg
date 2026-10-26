import React, { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';

const TONES = {
  gray: 'bg-ink-100 text-ink-700',
  green: 'bg-brand-100 text-brand-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  blue: 'bg-sky-100 text-sky-800',
  purple: 'bg-violet-100 text-violet-800',
};

export function Badge({ tone = 'gray', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const STATUS_TONE = { PENDING: 'amber', APPROVED: 'green', FLAGGED: 'purple', REJECTED: 'red' };
const STATUS_LABEL = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  FLAGGED: 'Flagged',
  REJECTED: 'Rejected',
};
export const StatusBadge = ({ status }) => (
  <Badge tone={STATUS_TONE[status] || 'gray'}>{STATUS_LABEL[status] || status}</Badge>
);

const ROLE_TONE = {
  ADMIN: 'purple',
  MANAGER: 'blue',
  ANALYST: 'green',
  AUDITOR: 'amber',
  PENDING: 'gray',
};
export const RoleBadge = ({ role, label }) => <Badge tone={ROLE_TONE[role] || 'gray'}>{label}</Badge>;

export function Spinner({ className = 'h-4 w-4' }) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded bg-ink-100 ${className}`} />;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-500">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-500">{children}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 sm:items-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md rounded-xl bg-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
