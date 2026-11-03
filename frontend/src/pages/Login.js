import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { BarChart3, Leaf, Mail, ShieldCheck, Workflow } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Spinner } from '../components/ui';
import api, { errorMessage } from '../api';

export const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

const FEATURES = [
  { icon: Workflow, text: 'Ingest SAP, utility and travel data in one place' },
  { icon: ShieldCheck, text: 'Manager review with a full, locked audit trail' },
  { icon: BarChart3, text: 'Scope 1, 2 and 3 emissions, ready to report' },
];

const INPUT =
  'w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';
const PRIMARY =
  'flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60';

// Sign in without a Google account: we email a 6-digit code.
function EmailCodeForm() {
  const { loginWithOtp } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0); // seconds until a new code may be requested

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const sendCode = async (event) => {
    event?.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    try {
      const res = await api.post('/auth/otp/request/', { email: address });
      setEmail(address);
      setCode('');
      setWait(res.data?.resend_in || 60);
      setStep('code');
    } catch (err) {
      const retry = err?.response?.data?.retry_after;
      if (retry) {
        // A code was just sent: go to the code box instead of blocking the user.
        setEmail(address);
        setWait(retry);
        setStep('code');
      }
      toast.error(errorMessage(err, 'Could not send the code. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await loginWithOtp(email, code);
    } catch (err) {
      toast.error(errorMessage(err, 'Sign-in failed. Please try again.'));
      setBusy(false);
    }
  };

  if (step === 'code') {
    return (
      <form onSubmit={verify} className="space-y-3">
        <p className="text-sm text-ink-600">
          We sent a 6-digit code to <strong className="break-all">{email}</strong>. Check your spam folder if
          you do not see it.
        </p>
        <label htmlFor="otp-code" className="sr-only">
          6-digit code
        </label>
        <input
          id="otp-code"
          className={`${INPUT} text-center text-lg tracking-[0.5em]`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          autoFocus
        />
        <button type="submit" className={PRIMARY} disabled={busy || code.length !== 6}>
          {busy ? <Spinner /> : null} Verify and continue
        </button>
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            className="text-ink-500 hover:text-ink-800"
            onClick={() => {
              setStep('email');
              setCode('');
            }}
          >
            Use a different email
          </button>
          <button
            type="button"
            className="font-medium text-brand-700 hover:text-brand-800 disabled:cursor-not-allowed disabled:text-ink-400"
            onClick={sendCode}
            disabled={busy || wait > 0}
          >
            {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="space-y-3">
      <label htmlFor="otp-email" className="block text-sm font-medium text-ink-700">
        Email address
      </label>
      <input
        id="otp-email"
        type="email"
        className={INPUT}
        placeholder="you@example.com"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <button type="submit" className={PRIMARY} disabled={busy || !email.trim()}>
        {busy ? <Spinner /> : <Mail className="h-4 w-4" aria-hidden="true" />} Email me a code
      </button>
    </form>
  );
}

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const signup = params.get('mode') === 'signup';

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
          <h1 className="text-2xl font-semibold text-ink-900">{signup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {signup
              ? 'Sign up with Google, or get a one-time code by email.'
              : 'Sign in with Google, or get a one-time code by email.'}
          </p>

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

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-ink-400" role="separator">
            <span className="h-px flex-1 bg-ink-200" /> or <span className="h-px flex-1 bg-ink-200" />
          </div>

          <EmailCodeForm />

          <p className="mt-6 text-xs text-ink-400">
            New here? Sign in either way and you will get your own private demo workspace with sample data to explore.
          </p>
          <Link to="/" className="mt-4 inline-block text-xs font-medium text-brand-700 hover:text-brand-800">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
