import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { BarChart3, Leaf, ShieldCheck, Workflow } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Spinner } from '../components/ui';
import { errorMessage } from '../api';

export const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

const FEATURES = [
  { icon: Workflow, text: 'Ingest SAP, utility and travel data in one place' },
  { icon: ShieldCheck, text: 'Manager review with a full, locked audit trail' },
  { icon: BarChart3, text: 'Scope 1, 2 and 3 emissions, ready to report' },
];

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const onSuccess = async (response) => {
    if (!response.credential) {
      toast.error('Google did not return a sign-in token. Please try again.');
      return;
    }
    setBusy(true);
    try {
      await loginWithGoogle(response.credential);
    } catch (err) {
      toast.error(errorMessage(err, 'Sign-in failed. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Leaf className="h-6 w-6 text-brand-300" /> NexESG
        </div>
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight">
            Trusted emissions data, from source file to audit.
          </h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-brand-100">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                <span className="text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-brand-200">© {new Date().getFullYear()} NexESG</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 text-lg font-semibold text-ink-900 lg:hidden">
            <Leaf className="h-6 w-6 text-brand-600" /> NexESG
          </div>
          <h1 className="text-2xl font-semibold text-ink-900">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in with your Google account to continue.</p>

          <div className="mt-8">
            {!GOOGLE_CLIENT_ID ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Google sign-in is not configured. Set <code>REACT_APP_GOOGLE_CLIENT_ID</code> in{' '}
                <code>frontend/.env.local</code> and restart the dev server.
              </div>
            ) : busy ? (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-ink-500">
                <Spinner /> Signing you in…
              </div>
            ) : (
              <GoogleLogin
                onSuccess={onSuccess}
                onError={() => toast.error('Google sign-in was cancelled or failed.')}
                theme="outline"
                size="large"
                width="360"
                text="continue_with"
              />
            )}
          </div>

          <p className="mt-6 text-xs text-ink-400">
            New here? Sign in with Google and you will get your own private demo workspace with sample data to explore.
          </p>
        </div>
      </div>
    </div>
  );
}
