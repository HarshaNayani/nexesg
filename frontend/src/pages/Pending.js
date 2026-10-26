import React, { useState } from 'react';
import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Spinner } from '../components/ui';
import { errorMessage } from '../api';

export default function Pending() {
  const { user, refreshUser, logout } = useAuth();
  const toast = useToast();
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    try {
      const fresh = await refreshUser();
      if (fresh.role === 'PENDING') toast.success('Still waiting for approval.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Clock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-ink-900">Waiting for approval</h1>
        <p className="mt-2 text-sm text-ink-500">
          You are signed in as <span className="font-medium text-ink-800">{user.email}</span>. An
          administrator needs to assign your role and company before you can use NexESG.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn-primary" onClick={check} disabled={checking}>
            {checking && <Spinner />} Check again
          </button>
          <button className="btn-secondary" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
