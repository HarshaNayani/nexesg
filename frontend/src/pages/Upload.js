import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Factory, FileSpreadsheet, Plane, TriangleAlert, Zap } from 'lucide-react';
import api, { errorMessage } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { PageHeader, Spinner } from '../components/ui';

const SOURCES = [
  {
    key: 'sap',
    title: 'SAP fuel & procurement',
    icon: Factory,
    help: 'Flat-file export from SAP (CSV).',
    columns: 'date, description, quantity, unit',
  },
  {
    key: 'utility',
    title: 'Utility electricity',
    icon: Zap,
    help: 'Electricity usage CSV from the utility portal.',
    columns: 'billing_date, meter_id, kwh',
  },
  {
    key: 'travel',
    title: 'Corporate travel',
    icon: Plane,
    help: 'Flights, hotels and ground transport export.',
    columns: 'travel_date, traveler, travel_type, distance_km',
  },
];

function UploadCard({ source, companyId, disabled }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const Icon = source.icon;

  const upload = async () => {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    if (companyId) form.append('company_id', companyId);

    setBusy(true);
    setResult(null);
    try {
      const res = await api.post(`/emissions/upload_${source.key}/`, form);
      setResult(res.data);
      if (res.data.records_created > 0) {
        toast.success(`${res.data.records_created} record${res.data.records_created === 1 ? '' : 's'} uploaded.`);
      }
      if (res.data.errors?.length === 0) {
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Upload failed. Check the file format.'));
    } finally {
      setBusy(false);
    }
  };

  const errors = result?.errors || [];

  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink-900">{source.title}</h2>
          <p className="text-xs text-ink-500">{source.help}</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-500">
        Required columns: <span className="font-mono text-ink-700">{source.columns}</span>
      </p>

      <label className="mt-3 flex cursor-pointer flex-col items-center rounded-lg border border-dashed border-ink-200 px-3 py-6 text-center text-sm text-ink-500 hover:border-brand-400 hover:bg-brand-50/40">
        <FileSpreadsheet className="mb-2 h-6 w-6 text-ink-400" />
        <span className="break-all">{file ? file.name : 'Choose a .csv file'}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files[0] || null);
            setResult(null);
          }}
        />
      </label>

      <button className="btn-primary mt-4" onClick={upload} disabled={!file || busy || disabled}>
        {busy && <Spinner />} Upload
      </button>

      {result && (
        <div className="mt-4 space-y-2 text-sm" role="status">
          {result.records_created > 0 && (
            <p className="flex items-center gap-2 text-brand-700">
              <CheckCircle2 className="h-4 w-4" /> {result.records_created} record
              {result.records_created === 1 ? '' : 's'} added as pending review.
            </p>
          )}
          {errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <p className="flex items-center gap-2 font-medium">
                <TriangleAlert className="h-4 w-4" /> {errors.length} row{errors.length === 1 ? '' : 's'} skipped
              </p>
              <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
                {errors.slice(0, 20).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              {errors.length > 20 && <p className="mt-1 text-xs">…and {errors.length - 20} more.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Upload() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [loadingCompanies, setLoadingCompanies] = useState(isAdmin);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get('/companies/')
      .then((res) => setCompanies(res.data))
      .catch((err) => toast.error(errorMessage(err, 'Could not load companies.')))
      .finally(() => setLoadingCompanies(false));
  }, [isAdmin, toast]);

  // Non-admins always upload to their own company; the server enforces this.
  const needsCompany = isAdmin && !companyId;

  return (
    <div>
      <PageHeader
        title="Upload data"
        subtitle="Files are normalized, converted to CO₂e and queued for manager review."
      />

      <div className="card mb-6 p-4">
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="company" className="text-sm font-medium text-ink-700">
              Upload for company
            </label>
            <select
              id="company"
              className="input w-auto min-w-[14rem]"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              disabled={loadingCompanies}
            >
              <option value="">{loadingCompanies ? 'Loading…' : 'Select a company'}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!loadingCompanies && companies.length === 0 && (
              <span className="text-sm text-ink-500">Create a company on the Users page first.</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-600">
            Uploading for <span className="font-medium text-ink-900">{user.company_name || 'your company'}</span>
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {SOURCES.map((s) => (
          <UploadCard key={s.key} source={s} companyId={isAdmin ? companyId : ''} disabled={needsCompany} />
        ))}
      </div>
    </div>
  );
}
