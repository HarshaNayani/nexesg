import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Leaf, LogOut, Menu, Upload, Users, X } from 'lucide-react';
import { ROLE_LABELS, useAuth } from '../auth/AuthContext';
import { RoleBadge } from './ui';

function navItems({ canUpload, isAdmin }) {
  return [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, show: true, end: true },
    { to: '/upload', label: 'Upload data', icon: Upload, show: canUpload },
    { to: '/users', label: 'Users', icon: Users, show: isAdmin },
  ].filter((item) => item.show);
}

function Avatar({ user }) {
  const initial = (user.first_name || user.email || '?')[0].toUpperCase();
  return user.picture ? (
    <img
      src={user.picture}
      alt=""
      referrerPolicy="no-referrer"
      className="h-9 w-9 rounded-full object-cover"
    />
  ) : (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
      {initial}
    </div>
  );
}

export default function Layout() {
  const auth = useAuth();
  const { user, logout } = auth;
  const [open, setOpen] = useState(false);
  const items = navItems(auth);
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-ink-100 px-5 text-lg font-semibold text-ink-900">
        <Leaf className="h-6 w-6 text-brand-600" /> NexESG
      </div>

      <nav className="flex-1 space-y-1 p-3" aria-label="Main">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
              }`
            }
          >
            <Icon className="h-5 w-5" /> {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-ink-100 p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar user={user} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-900">{displayName}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <RoleBadge role={user.role} label={ROLE_LABELS[user.role]} />
            </div>
          </div>
        </div>
        {user.company_name && (
          <p className="truncate px-2 pb-1 text-xs text-ink-500">{user.company_name}</p>
        )}
        <button
          onClick={logout}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900"
        >
          <LogOut className="h-5 w-5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-ink-100 lg:block">{sidebar}</aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-100 bg-white px-4 lg:hidden">
        <div className="flex items-center gap-2 font-semibold text-ink-900">
          <Leaf className="h-5 w-5 text-brand-600" /> NexESG
        </div>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-ink-600">
          <Menu className="h-6 w-6" />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 text-ink-500"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
          {user.role === 'DEMO' && (
            <div
              role="note"
              className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
            >
              <span className="font-medium">Demo workspace.</span> This is your own private sandbox with sample
              data. Upload files and approve, flag or reject records freely. Nothing here affects anyone else.
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
