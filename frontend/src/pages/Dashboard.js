import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Flag, Inbox, Lock, Search, X } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { EmptyState, Modal, PageHeader, Skeleton, Spinner, StatusBadge, Badge } from '../components/ui';

const SCOPE_LABEL = { SCOPE1: 'Scope 1', SCOPE2: 'Scope 2', SCOPE3: 'Scope 3' };
const SOURCE_LABEL = { SAP: 'SAP', UTILITY: 'Utility', TRAVEL: 'Travel' };

const HEADINGS = {
  ADMIN: ['Dashboard', 'All emission records across companies.'],
  MANAGER: ['Review queue', 'Approve, flag or reject records submitted by your analysts.'],
  ANALYST: ['Your uploads', 'Track the review status of the data you have submitted.'],
  AUDITOR: ['Audit view', 'Approved records, locked and read-only.'],
};

const REVIEW_COPY = {
  approve: {
    title: 'Approve and lock record',
    confirm: 'Approve',
    help: 'Approving locks the record for audit. It cannot be changed afterwards.',
  },
  flag: {
    title: 'Flag as suspicious',
    confirm: 'Flag record',
    help: 'Explain what looks wrong so the analyst can follow up.',
  },
  reject: {
    title: 'Reject record',
    confirm: 'Reject record',
    help: 'Explain why this record cannot be accepted.',
  },
};

const number = (value, digits = 2) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits });

function StatCard({ label, value, loading, tone = 'text-ink-900' }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      )}
    </div>
  );
}

function ReviewModal({ review, onClose, onDone }) {
  const toast = useToast();
  const { record, action } = review;
  const copy = REVIEW_COPY[action];
  const needsReason = action !== 'approve';
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (needsReason && !notes.trim()) {
      setError('A reason is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(`/emissions/${record.id}/${action}/`, { notes: notes.trim() });
      toast.success(
        action === 'approve' ? 'Record approved and locked.' : `Record ${action === 'flag' ? 'flagged' : 'rejected'}.`
      );
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={copy.title}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className={action === 'approve' ? 'btn-primary' : 'btn-danger'}
            onClick={submit}
            disabled={busy}
          >
            {busy && <Spinner />} {copy.confirm}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-600">
        <span className="font-medium text-ink-800">{record.description || 'Record'}</span> ·{' '}
        {record.activity_date} · {number(record.co2_equivalent)} kg CO₂e
      </p>
      <p className="mt-2 text-sm text-ink-500">{copy.help}</p>
      {needsReason && (
        <textarea
          className="input mt-4 min-h-[96px]"
          placeholder="Reason"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          autoFocus
        />
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </Modal>
  );
}

export default function Dashboard() {
  const { user, canReview, canUpload } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [query, setQuery] = useState('');
  const [review, setReview] = useState(null);

  const isAuditor = user.role === 'AUDITOR';
  const [title, subtitle] = HEADINGS[user.role] || HEADINGS.ADMIN;

  const load = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      const [recs, sum] = await Promise.all([
        api.get('/emissions/', { params }),
        api.get('/emissions/summary/'),
      ]);
      setRecords(recs.data);
      setSummary(sum.data);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load records.'));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        (r.description || '').toLowerCase().includes(q) || (r.source_file || '').toLowerCase().includes(q)
    );
  }, [records, query]);

  const totalCo2 = useMemo(() => visible.reduce((sum, r) => sum + (r.co2_equivalent || 0), 0), [visible]);
  const filtered = Boolean(statusFilter || sourceFilter || query);

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total records" value={summary?.total ?? 0} loading={loading && !summary} />
        <StatCard label="Pending review" value={summary?.pending ?? 0} loading={loading && !summary} tone="text-amber-600" />
        <StatCard label="Approved" value={summary?.approved ?? 0} loading={loading && !summary} tone="text-brand-600" />
        <StatCard label="Flagged" value={summary?.flagged ?? 0} loading={loading && !summary} tone="text-violet-600" />
      </div>

      <div className="card mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 p-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-400" />
            <input
              className="input pl-9"
              placeholder="Search description or file"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search records"
            />
          </div>
          {!isAuditor && (
            <select
              className="input w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="FLAGGED">Flagged</option>
              <option value="REJECTED">Rejected</option>
            </select>
          )}
          <select
            className="input w-auto"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            <option value="SAP">SAP</option>
            <option value="UTILITY">Utility</option>
            <option value="TRAVEL">Travel</option>
          </select>
          {filtered && (
            <button
              className="btn-secondary"
              onClick={() => {
                setStatusFilter('');
                setSourceFilter('');
                setQuery('');
              }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 text-right font-medium">Quantity</th>
                <th className="px-4 py-3 text-right font-medium">CO₂e (kg)</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canReview && <th className="px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={canReview ? 8 : 7} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}

              {!loading &&
                visible.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">{r.activity_date}</td>
                    <td className="px-4 py-3">
                      <Badge tone="blue">{SOURCE_LABEL[r.source] || r.source}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-600">{SCOPE_LABEL[r.scope] || r.scope}</td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-ink-800" title={r.description}>
                      {r.description || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-ink-600">
                      {number(r.normalized_quantity)} {r.normalized_unit}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink-900">
                      {number(r.co2_equivalent)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                      {r.review_notes && (
                        <p className="mt-1 max-w-[14rem] truncate text-xs text-ink-500" title={r.review_notes}>
                          {r.review_notes}
                        </p>
                      )}
                      {r.reviewed_by && (
                        <p className="mt-0.5 max-w-[14rem] truncate text-xs text-ink-400" title={r.reviewed_by}>
                          by {r.reviewed_by}
                        </p>
                      )}
                    </td>
                    {canReview && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {r.locked_for_audit ? (
                            <span className="inline-flex items-center gap-1 text-xs text-ink-500">
                              <Lock className="h-3.5 w-3.5" /> Locked
                            </span>
                          ) : (
                            <>
                              <button
                                className="rounded-md p-1.5 text-brand-700 hover:bg-brand-50"
                                title="Approve"
                                aria-label="Approve record"
                                onClick={() => setReview({ record: r, action: 'approve' })}
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                className="rounded-md p-1.5 text-violet-700 hover:bg-violet-50"
                                title="Flag"
                                aria-label="Flag record"
                                onClick={() => setReview({ record: r, action: 'flag' })}
                              >
                                <Flag className="h-4 w-4" />
                              </button>
                              <button
                                className="rounded-md p-1.5 text-red-700 hover:bg-red-50"
                                title="Reject"
                                aria-label="Reject record"
                                onClick={() => setReview({ record: r, action: 'reject' })}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>

          {!loading && visible.length === 0 && (
            <EmptyState icon={Inbox} title={filtered ? 'No matching records' : 'No records yet'}>
              {filtered ? (
                'Try changing or clearing the filters.'
              ) : canUpload ? (
                <>
                  Head to <Link className="font-medium text-brand-700 underline" to="/upload">Upload data</Link> to
                  add your first file.
                </>
              ) : (
                'Records will appear here once data has been uploaded and approved.'
              )}
            </EmptyState>
          )}
        </div>

        {!loading && visible.length > 0 && (
          <div className="flex items-center justify-between border-t border-ink-100 px-4 py-3 text-xs text-ink-500">
            <span>
              {visible.length} record{visible.length === 1 ? '' : 's'}
            </span>
            <span>
              CO₂e in view: <span className="font-medium text-ink-800">{number(totalCo2 / 1000, 3)} t</span>
            </span>
          </div>
        )}
      </div>

      {review && (
        <ReviewModal
          review={review}
          onClose={() => setReview(null)}
          onDone={() => {
            setReview(null);
            load();
          }}
        />
      )}
    </div>
  );
}
