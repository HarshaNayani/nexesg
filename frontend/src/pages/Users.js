import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Plus, UserCog } from 'lucide-react';
import api, { errorMessage } from '../api';
import { ROLE_LABELS, useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Badge, EmptyState, PageHeader, RoleBadge, Skeleton, Spinner } from '../components/ui';

const ROLE_OPTIONS = ['PENDING', 'ANALYST', 'MANAGER', 'AUDITOR', 'ADMIN'];
const NEEDS_COMPANY = ['ANALYST', 'MANAGER', 'AUDITOR'];

function CompaniesCard({ companies, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await api.post('/companies/', { name: trimmed });
      setName('');
      toast.success(`Company "${trimmed}" created.`);
      onCreated();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Building2 className="h-4 w-4 text-ink-500" /> Companies
      </h2>
      <form onSubmit={create} className="mt-3 flex gap-2">
        <input
          className="input"
          placeholder="New company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="New company name"
        />
        <button className="btn-primary shrink-0" disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : <Plus className="h-4 w-4" />} Add
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {companies.length === 0 && <p className="text-sm text-ink-500">No companies yet.</p>}
        {companies.map((c) => (
          <Badge key={c.id} tone="gray">
            {c.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function UserRow({ u, companies, isSelf, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState({ role: u.role, company: u.company ?? '', is_active: u.is_active });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Keep the row in sync after a save or refresh.
  useEffect(() => {
    setDraft({ role: u.role, company: u.company ?? '', is_active: u.is_active });
  }, [u.role, u.company, u.is_active]);

  const dirty =
    draft.role !== u.role || String(draft.company) !== String(u.company ?? '') || draft.is_active !== u.is_active;
  const missingCompany = NEEDS_COMPANY.includes(draft.role) && !draft.company;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/users/${u.id}/`, {
        role: draft.role,
        company: draft.company === '' ? null : Number(draft.company),
        is_active: draft.is_active,
      });
      toast.success(`Updated ${u.email}.`);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const name = [u.first_name, u.last_name].filter(Boolean).join(' ');

  return (
    <tr className={u.role === 'PENDING' ? 'bg-amber-50/50' : ''}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {u.picture ? (
            <img src={u.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
              {(name || u.email)[0].toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">
              {name || u.email} {isSelf && <span className="text-xs font-normal text-ink-400">(you)</span>}
            </p>
            {name && <p className="truncate text-xs text-ink-500">{u.email}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {isSelf ? (
          <RoleBadge role={u.role} label={ROLE_LABELS[u.role]} />
        ) : (
          <select
            className="input w-auto"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            aria-label={`Role for ${u.email}`}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-4 py-3">
        {isSelf ? (
          <span className="text-sm text-ink-500">{u.company_name || 'All companies'}</span>
        ) : (
          <select
            className={`input w-auto min-w-[10rem] ${missingCompany ? 'border-amber-400' : ''}`}
            value={draft.company}
            onChange={(e) => setDraft({ ...draft, company: e.target.value })}
            aria-label={`Company for ${u.email}`}
          >
            <option value="">{NEEDS_COMPANY.includes(draft.role) ? 'Select company' : 'None'}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-4 py-3">
        {isSelf ? (
          <Badge tone="green">Active</Badge>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            />
            Active
          </label>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {!isSelf && (
          <>
            <button className="btn-primary" onClick={save} disabled={!dirty || busy || missingCompany}>
              {busy && <Spinner />} Save
            </button>
            {missingCompany && dirty && <p className="mt-1 text-xs text-amber-700">Pick a company first.</p>}
            {error && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {error}
              </p>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([api.get('/users/'), api.get('/companies/')]);
      setUsers(u.data);
      setCompanies(c.data);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load users.'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // People waiting for approval first.
  const sorted = useMemo(
    () => [...users].sort((a, b) => (a.role === 'PENDING' ? 0 : 1) - (b.role === 'PENDING' ? 0 : 1)),
    [users]
  );
  const pendingCount = users.filter((u) => u.role === 'PENDING').length;

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={
          pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? 'person is' : 'people are'} waiting for a role.`
            : 'Assign roles and companies. New sign-ins appear here as Pending.'
        }
      />

      <div className="mb-6">
        <CompaniesCard companies={companies} onCreated={load} />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading &&
                sorted.map((u) => (
                  <UserRow key={u.id} u={u} companies={companies} isSelf={u.id === me.id} onSaved={load} />
                ))}
            </tbody>
          </table>
        </div>
        {!loading && users.length === 0 && <EmptyState icon={UserCog} title="No users yet" />}
      </div>
    </div>
  );
}
