import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { errorMessage } from '../api';
import { useToast } from './Toast';
import { Spinner } from './ui';

// One click: creates a guest demo workspace and signs the visitor in.
export default function FreeDemoButton({ className = '', children = 'Free demo' }) {
  const { startDemo } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      await startDemo();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start the demo. Please try again.'));
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={onClick} disabled={busy} className={`${className} disabled:cursor-wait disabled:opacity-70`}>
      {busy ? <Spinner /> : null} {busy ? 'Starting demo…' : children}
    </button>
  );
}
