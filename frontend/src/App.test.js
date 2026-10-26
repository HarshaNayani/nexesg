import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import api, { tokens } from './api';

// Replace the network layer; keep the real error helper.
jest.mock('./api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
  tokens: { access: jest.fn(), refresh: jest.fn(), set: jest.fn(), clear: jest.fn() },
  LOGOUT_EVENT: 'besg:logout',
  errorMessage: (err, fallback) => err?.response?.data?.error || fallback || 'error',
}));

// The real button loads Google's script. A plain button is enough to test our flow.
jest.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }) => children,
  GoogleLogin: ({ onSuccess }) => (
    <button onClick={() => onSuccess({ credential: 'google-id-token' })}>Continue with Google</button>
  ),
}));

const makeUser = (role, extra = {}) => ({
  id: 1,
  email: `${role.toLowerCase()}@example.com`,
  first_name: 'Test',
  last_name: 'User',
  picture: '',
  role,
  company: role === 'ADMIN' ? null : 7,
  company_name: role === 'ADMIN' ? null : 'Acme Ltd',
  is_active: true,
  ...extra,
});

const record = (extra = {}) => ({
  id: 11,
  activity_date: '2026-01-15',
  source: 'SAP',
  scope: 'SCOPE1',
  description: 'Diesel purchase',
  normalized_quantity: 100,
  normalized_unit: 'liters',
  co2_equivalent: 268,
  status: 'PENDING',
  locked_for_audit: false,
  review_notes: '',
  reviewed_by: '',
  source_file: 'sap.csv',
  ...extra,
});

const SUMMARY = { total: 1, pending: 1, approved: 0, flagged: 0, rejected: 0 };

// Pretend a user is already signed in and the API returns the given records.
function signedInAs(role, records = [record()]) {
  tokens.access.mockReturnValue('access-token');
  tokens.refresh.mockReturnValue('refresh-token');
  api.get.mockImplementation((url) => {
    if (url === '/auth/me/') return Promise.resolve({ data: makeUser(role) });
    if (url === '/emissions/') return Promise.resolve({ data: records });
    if (url === '/emissions/summary/') return Promise.resolve({ data: SUMMARY });
    if (url === '/users/') return Promise.resolve({ data: [makeUser('ANALYST', { id: 2, email: 'a@x.com' })] });
    if (url === '/companies/') return Promise.resolve({ data: [{ id: 7, name: 'Acme Ltd' }] });
    return Promise.reject(new Error(`unmocked GET ${url}`));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  tokens.access.mockReturnValue(null);
  tokens.refresh.mockReturnValue(null);
  window.location.hash = '';
});

describe('signing in', () => {
  test('logged-out visitors see the Google sign-in page', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  test('Google credential is exchanged for a session and the dashboard opens', async () => {
    api.post.mockResolvedValue({
      data: { access: 'a', refresh: 'r', user: makeUser('ANALYST') },
    });
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url === '/emissions/summary/' ? SUMMARY : [] })
    );

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(await screen.findByRole('heading', { name: /your uploads/i })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/google/', { id_token: 'google-id-token' });
    expect(tokens.set).toHaveBeenCalledWith({ access: 'a', refresh: 'r' });
  });

  test('a failed sign-in shows the server message and stays on the login page', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'This account has been disabled.' } } });
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(await screen.findByText(/account has been disabled/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  test('a saved session is restored without signing in again', async () => {
    signedInAs('MANAGER');
    render(<App />);
    expect(await screen.findByRole('heading', { name: /review queue/i })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/auth/me/');
  });

  test('an expired saved session falls back to the login page', async () => {
    tokens.access.mockReturnValue('stale');
    api.get.mockRejectedValue({ response: { status: 401 } });
    render(<App />);
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(tokens.clear).toHaveBeenCalled();
  });

  test('pending users only see the waiting screen', async () => {
    signedInAs('PENDING');
    render(<App />);
    expect(await screen.findByRole('heading', { name: /waiting for approval/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/emissions/');
  });
});

describe('role-based navigation', () => {
  const links = async () => {
    const nav = await screen.findByRole('navigation', { name: /main/i });
    return within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent.trim());
  };

  test.each([
    ['ADMIN', ['Dashboard', 'Upload data', 'Users']],
    ['ANALYST', ['Dashboard', 'Upload data']],
    ['MANAGER', ['Dashboard']],
    ['AUDITOR', ['Dashboard']],
  ])('%s sees %j', async (role, expected) => {
    signedInAs(role);
    render(<App />);
    expect(await links()).toEqual(expected);
  });

  test('a manager who types the upload URL is sent back to the dashboard', async () => {
    signedInAs('MANAGER');
    window.location.hash = '#/upload';
    render(<App />);
    expect(await screen.findByRole('heading', { name: /review queue/i })).toBeInTheDocument();
    expect(screen.queryByText(/required columns/i)).not.toBeInTheDocument();
  });
});

describe('dashboard by role', () => {
  test('managers can review pending records', async () => {
    signedInAs('MANAGER');
    render(<App />);
    expect(await screen.findByText('Diesel purchase')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve record/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /flag record/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject record/i })).toBeInTheDocument();
  });

  test('analysts and auditors cannot see review buttons', async () => {
    for (const role of ['ANALYST', 'AUDITOR']) {
      signedInAs(role);
      const { unmount } = render(<App />);
      expect(await screen.findByText('Diesel purchase')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /approve record/i })).not.toBeInTheDocument();
      unmount();
    }
  });

  test('auditors do not get a status filter', async () => {
    signedInAs('AUDITOR');
    render(<App />);
    await screen.findByText('Diesel purchase');
    expect(screen.queryByLabelText(/filter by status/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/filter by source/i)).toBeInTheDocument();
  });

  test('locked records show a lock instead of actions', async () => {
    signedInAs('MANAGER', [record({ status: 'APPROVED', locked_for_audit: true })]);
    render(<App />);
    expect(await screen.findByText(/locked/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve record/i })).not.toBeInTheDocument();
  });

  test('flagging needs a reason before anything is sent', async () => {
    signedInAs('MANAGER');
    api.post.mockResolvedValue({ data: { message: 'Record flagged' } });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /flag record/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /flag record/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/reason is required/i);
    expect(api.post).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByPlaceholderText(/reason/i), 'Usage looks 3x too high');
    await userEvent.click(within(dialog).getByRole('button', { name: /flag record/i }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/emissions/11/flag/', { notes: 'Usage looks 3x too high' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('approving warns that the record gets locked and posts to the server', async () => {
    signedInAs('MANAGER');
    api.post.mockResolvedValue({ data: {} });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /approve record/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cannot be changed afterwards/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /^approve$/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/emissions/11/approve/', { notes: '' }));
  });

  test('server errors during review are shown in the dialog', async () => {
    signedInAs('MANAGER');
    api.post.mockRejectedValue({ response: { data: { error: 'Record is locked for audit' } } });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /approve record/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^approve$/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/locked for audit/i);
  });

  test('search narrows the table', async () => {
    signedInAs('ADMIN', [record(), record({ id: 12, description: 'Office electricity', source: 'UTILITY' })]);
    render(<App />);
    await screen.findByText('Diesel purchase');
    await userEvent.type(screen.getByLabelText(/search records/i), 'electric');
    expect(screen.queryByText('Diesel purchase')).not.toBeInTheDocument();
    expect(screen.getByText('Office electricity')).toBeInTheDocument();
  });

  test('empty state points analysts to the upload page', async () => {
    signedInAs('ANALYST', []);
    render(<App />);
    expect(await screen.findByText(/no records yet/i)).toBeInTheDocument();
    // The sidebar also has an "Upload data" link, so look inside the page content only.
    expect(within(screen.getByRole('main')).getByRole('link', { name: /upload data/i })).toBeInTheDocument();
  });
});

describe('admin users page', () => {
  test('admins can assign a role and company', async () => {
    signedInAs('ADMIN');
    api.get.mockImplementation((url) => {
      if (url === '/auth/me/') return Promise.resolve({ data: makeUser('ADMIN', { id: 1 }) });
      if (url === '/users/')
        return Promise.resolve({
          data: [makeUser('PENDING', { id: 2, email: 'new@x.com', company: null, company_name: null })],
        });
      if (url === '/companies/') return Promise.resolve({ data: [{ id: 7, name: 'Acme Ltd' }] });
      return Promise.resolve({ data: [] });
    });
    api.patch.mockResolvedValue({ data: {} });
    window.location.hash = '#/users';
    render(<App />);

    const roleSelect = await screen.findByLabelText(/role for new@x.com/i);
    const save = screen.getByRole('button', { name: /save/i });
    expect(save).toBeDisabled();

    await userEvent.selectOptions(roleSelect, 'ANALYST');
    // Analysts need a company, so saving is blocked until one is picked.
    expect(save).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText(/company for new@x.com/i), '7');
    expect(save).toBeEnabled();

    await userEvent.click(save);
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/users/2/', { role: 'ANALYST', company: 7, is_active: true })
    );
  });
});
