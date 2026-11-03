import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

describe('landing page', () => {
  test('logged-out visitors land on the product page with sign in and sign up at the top', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /from source file to audit/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /welcome back/i })).not.toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '#/login');
    expect(within(header).getByRole('link', { name: /^sign up$/i })).toHaveAttribute('href', '#/login?mode=signup');
  });

  test('explains ESG, how it works, and the CO2 rates the app really uses', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /what is esg/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /four steps/i })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('2.68')).toBeInTheDocument(); // diesel, per litre
    expect(within(table).getByText('0.82')).toBeInTheDocument(); // India grid, per kWh
    expect(within(table).getByText('0.255')).toBeInTheDocument(); // flight, per km
    expect(screen.getByText(/1,340/)).toBeInTheDocument(); // the worked example: 500 x 2.68
  });

  test('footer shows the owner name and a LinkedIn link that opens in a new tab', () => {
    render(<App />);
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText(/Harshavardhan Reddy Nayani/)).toBeInTheDocument();
    const link = within(footer).getByRole('link', { name: /on linkedin/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link.getAttribute('href')).toMatch(/^https:\/\/www\.linkedin\.com\//);
  });

  test('Sign in leads to the login page, Sign up to the sign-up wording', async () => {
    render(<App />);
    await userEvent.click(within(screen.getByRole('banner')).getByRole('link', { name: /^sign in$/i }));
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /back to home/i }));
    await userEvent.click(within(screen.getByRole('banner')).getByRole('link', { name: /^sign up$/i }));
    expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument();
  });

  test('unknown addresses fall back to the landing page', () => {
    window.location.hash = '#/somewhere-else';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /from source file to audit/i })).toBeInTheDocument();
  });

  test('signing out returns to the landing page', async () => {
    signedInAs('MANAGER');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /from source file to audit/i })).toBeInTheDocument();
  });
});

describe('free demo and header menus', () => {
  const demoResponse = { data: { access: 'g', refresh: 'gr', user: makeUser('DEMO', { first_name: 'Guest abc123' }) } };
  const quietApi = () =>
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/emissions/summary/' ? SUMMARY : [] }));

  test('Try free demo on the landing page signs in as a guest without any login', async () => {
    api.post.mockResolvedValue(demoResponse);
    quietApi();
    render(<App />);
    await userEvent.click(screen.getAllByRole('button', { name: /try free demo/i })[0]);
    expect(await screen.findByRole('heading', { name: /demo workspace/i })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/demo/');
    expect(tokens.set).toHaveBeenCalledWith({ access: 'g', refresh: 'gr' });
  });

  test('the login page has a Free demo button and only the one-line Google heading text', async () => {
    window.location.hash = '#/login';
    api.post.mockResolvedValue(demoResponse);
    quietApi();
    render(<App />);
    expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
    expect(screen.queryByText(/one-time code by email\./i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^free demo$/i }));
    expect(await screen.findByRole('heading', { name: /demo workspace/i })).toBeInTheDocument();
  });

  test('the sign-up page says Sign up with Google', () => {
    window.location.hash = '#/login?mode=signup';
    render(<App />);
    expect(screen.getByText('Sign up with Google')).toBeInTheDocument();
  });

  test('a demo that fails to start shows the server message and stays put', async () => {
    api.post.mockRejectedValue({ response: { status: 429, data: { error: 'The demo is very busy. Please try again in a few minutes.' } } });
    render(<App />);
    await userEvent.click(screen.getAllByRole('button', { name: /try free demo/i })[0]);
    expect(await screen.findByText(/demo is very busy/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /from source file to audit/i })).toBeInTheDocument();
  });

  test('header menus open on click and list their pages; AI Agents is marked coming soon', async () => {
    render(<App />);
    const header = screen.getByRole('banner');
    const learn = within(header).getByRole('button', { name: /^learn$/i });
    expect(learn).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(learn);
    expect(learn).toHaveAttribute('aria-expanded', 'true');
    const list = within(header).getByRole('list', { name: /learn/i });
    expect(within(list).getByRole('button', { name: /what is esg/i })).toBeEnabled();
    expect(within(list).getByRole('button', { name: /co₂ rates/i })).toBeEnabled();

    await userEvent.click(within(header).getByRole('button', { name: /ai agents/i }));
    const ai = within(header).getByRole('list', { name: /ai agents/i });
    expect(within(ai).getByRole('button', { name: /esg assistant/i })).toBeDisabled();
    expect(within(ai).getByText(/coming soon/i)).toBeInTheDocument();
  });

  describe('transparent header', () => {
    const overDarkSection = (isOver) =>
      jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
        const dark = this.hasAttribute && this.hasAttribute('data-dark-section');
        return dark && isOver
          ? { top: -20, bottom: 500, left: 0, right: 0, width: 0, height: 520 }
          : { top: 900, bottom: 1400, left: 0, right: 0, width: 0, height: 500 };
      });
    afterEach(() => jest.restoreAllMocks());

    test('has a 10% tint (no blur), no dropdown arrows, and a green gradient NexESG name', () => {
      overDarkSection(true);
      render(<App />);
      const header = screen.getByRole('banner');
      expect(header).toHaveClass('bg-white/10');
      expect(header.className).not.toMatch(/backdrop/);
      expect(header.querySelector('svg.lucide-chevron-down')).toBeNull();
      const name = within(header).getByText('NexESG');
      expect(name).toHaveClass('bg-clip-text', 'text-transparent');
      expect(name.className).toMatch(/emerald|brand/);
    });

    test('the tint flips to a dark 10% over light sections', () => {
      overDarkSection(false);
      render(<App />);
      expect(screen.getByRole('banner')).toHaveClass('bg-ink-900/10');
    });

    test('hovering a name opens its dropdown with the same 10% tint, and leaving closes it', async () => {
      overDarkSection(true);
      render(<App />);
      const header = screen.getByRole('banner');
      const learn = within(header).getByRole('button', { name: /^learn$/i });
      await userEvent.hover(learn);
      const list = within(header).getByRole('list', { name: /learn/i });
      expect(list).toHaveClass('bg-white/10', 'backdrop-blur-xl');
      await userEvent.unhover(learn);
      expect(within(header).queryByRole('list', { name: /learn/i })).not.toBeInTheDocument();
    });

    test('text is white over a dark section and dark over a light one', async () => {
      overDarkSection(true);
      const { unmount } = render(<App />);
      expect(within(screen.getByRole('banner')).getByRole('link', { name: /^sign in$/i })).toHaveClass('text-white');
      unmount();

      jest.restoreAllMocks();
      overDarkSection(false);
      render(<App />);
      const link = within(screen.getByRole('banner')).getByRole('link', { name: /^sign in$/i });
      expect(link).toHaveClass('text-ink-900');
      expect(within(screen.getByRole('banner')).getByRole('link', { name: /^sign up$/i })).toHaveClass('bg-brand-600');
    });

    test('switches when the page scrolls past the hero', () => {
      let over = true;
      jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
        const dark = this.hasAttribute && this.hasAttribute('data-dark-section');
        return dark && over ? { top: 0, bottom: 600 } : { top: 900, bottom: 1400 };
      });
      render(<App />);
      const link = () => within(screen.getByRole('banner')).getByRole('link', { name: /^sign in$/i });
      expect(link()).toHaveClass('text-white');
      over = false;
      fireEvent.scroll(window);
      expect(link()).toHaveClass('text-ink-900');
    });
  });

  test('Escape closes an open menu', async () => {
    render(<App />);
    const header = screen.getByRole('banner');
    const platform = within(header).getByRole('button', { name: /^platform$/i });
    await userEvent.click(platform);
    expect(platform).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(platform).toHaveAttribute('aria-expanded', 'false');
  });

  test('picking a menu item scrolls to its section', async () => {
    const scrollIntoView = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(<App />);
    const header = screen.getByRole('banner');
    await userEvent.click(within(header).getByRole('button', { name: /^learn$/i }));
    await userEvent.click(within(header).getByRole('button', { name: /^faq/i }));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  test('mobile menu button toggles the full list of pages', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: /^faq/i }).length).toBeGreaterThan(0);
  });

  test('guest users are signed out back to the landing page like anyone else', async () => {
    signedInAs('DEMO');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /from source file to audit/i })).toBeInTheDocument();
  });
});

describe('signing in', () => {
  beforeEach(() => {
    window.location.hash = '#/login';
  });

  test('logged-out visitors see the Google sign-in page', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByText(/private demo workspace/i)).toBeInTheDocument();
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

describe('signing in with an email code', () => {
  beforeEach(() => {
    window.location.hash = '#/login';
  });

  const askForCode = async (address = 'visitor@example.com') => {
    await userEvent.type(screen.getByLabelText(/email address/i), address);
    await userEvent.click(screen.getByRole('button', { name: /email me a code/i }));
  };

  test('email form is shown next to Google sign-in', () => {
    render(<App />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeDisabled();
  });

  test('request a code, enter it, and land on the dashboard', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/auth/otp/request/') return Promise.resolve({ data: { resend_in: 60 } });
      if (url === '/auth/otp/verify/') {
        return Promise.resolve({ data: { access: 'a', refresh: 'r', user: makeUser('DEMO') } });
      }
      return Promise.reject(new Error(`unmocked POST ${url}`));
    });
    api.get.mockImplementation((url) =>
      Promise.resolve({ data: url === '/emissions/summary/' ? SUMMARY : [] })
    );

    render(<App />);
    await askForCode();
    expect(api.post).toHaveBeenCalledWith('/auth/otp/request/', { email: 'visitor@example.com' });

    expect(await screen.findByText(/sent a 6-digit code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend code in/i })).toBeDisabled();
    const verifyButton = screen.getByRole('button', { name: /verify and continue/i });
    expect(verifyButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/6-digit code/i), '12a3456');
    expect(screen.getByLabelText(/6-digit code/i)).toHaveValue('123456'); // letters are dropped
    await userEvent.click(verifyButton);

    expect(await screen.findByRole('heading', { name: /demo workspace/i })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/otp/verify/', {
      email: 'visitor@example.com',
      code: '123456',
    });
    expect(tokens.set).toHaveBeenCalledWith({ access: 'a', refresh: 'r' });
  });

  test('a wrong code shows the server message and keeps the code box', async () => {
    api.post.mockImplementation((url) =>
      url === '/auth/otp/request/'
        ? Promise.resolve({ data: { resend_in: 60 } })
        : Promise.reject({ response: { status: 400, data: { error: 'That code is wrong or has expired.' } } })
    );
    render(<App />);
    await askForCode();
    await userEvent.type(await screen.findByLabelText(/6-digit code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify and continue/i }));

    expect(await screen.findByText(/wrong or has expired/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(tokens.set).not.toHaveBeenCalled();
  });

  test('if the email cannot be sent the user stays on the email step', async () => {
    api.post.mockRejectedValue({ response: { status: 503, data: { error: 'Email sign-in is not set up on the server yet.' } } });
    render(<App />);
    await askForCode();
    expect(await screen.findByText(/not set up on the server/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  test('asking again too soon moves to the code box with a countdown', async () => {
    api.post.mockRejectedValue({
      response: { status: 429, data: { error: 'Please wait 40 seconds before asking for another code.', retry_after: 40 } },
    });
    render(<App />);
    await askForCode();
    expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend code in 40s/i })).toBeDisabled();
  });

  test('"use a different email" goes back to the email step', async () => {
    api.post.mockResolvedValue({ data: { resend_in: 60 } });
    render(<App />);
    await askForCode();
    await userEvent.click(await screen.findByRole('button', { name: /use a different email/i }));
    expect(screen.getByLabelText(/email address/i)).toHaveValue('visitor@example.com');
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
    ['DEMO', ['Dashboard', 'Upload data']],
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

describe('demo workspace', () => {
  test('demo users see the sandbox banner and can review records', async () => {
    signedInAs('DEMO');
    render(<App />);
    expect(await screen.findByRole('heading', { name: /demo workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/private sandbox/i);
    // Records load after the page shell, so wait for them.
    expect(await screen.findByRole('button', { name: /approve record/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /users/i })).not.toBeInTheDocument();
  });

  test('other roles never see the demo banner', async () => {
    for (const role of ['ADMIN', 'MANAGER', 'ANALYST', 'AUDITOR']) {
      signedInAs(role);
      const { unmount } = render(<App />);
      await screen.findByText('Diesel purchase');
      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      unmount();
    }
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
