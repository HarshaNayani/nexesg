import axios from 'axios';
import api, { LOGOUT_EVENT, errorMessage, tokens } from './api';

// A fake network: `routes` maps a url fragment to (config) => [status, data].
function fakeNetwork(routes) {
  const calls = [];
  const adapter = (config) => {
    calls.push(config);
    const key = Object.keys(routes).find((k) => config.url.includes(k));
    const [status, data] = key ? routes[key](config) : [404, {}];
    const response = { data, status, statusText: '', headers: {}, config, request: {} };
    if (status >= 200 && status < 300) return Promise.resolve(response);
    return Promise.reject(new axios.AxiosError('failed', 'ERR_BAD_REQUEST', config, {}, response));
  };
  // The instance and the bare axios used for refreshing both need the fake.
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
  return calls;
}

const bearer = (config) => config.headers.get('Authorization');

beforeEach(() => {
  localStorage.clear();
});

test('sends the access token as a bearer header', async () => {
  tokens.set({ access: 'abc', refresh: 'def' });
  const calls = fakeNetwork({ '/emissions/': () => [200, []] });
  await api.get('/emissions/');
  expect(bearer(calls[0])).toBe('Bearer abc');
});

test('an expired access token is refreshed and the request is retried', async () => {
  tokens.set({ access: 'old', refresh: 'r1' });
  const calls = fakeNetwork({
    '/auth/refresh/': () => [200, { access: 'new' }],
    '/emissions/': (c) => (bearer(c) === 'Bearer new' ? [200, ['ok']] : [401, { detail: 'expired' }]),
  });

  const res = await api.get('/emissions/');

  expect(res.data).toEqual(['ok']);
  expect(tokens.access()).toBe('new');
  expect(tokens.refresh()).toBe('r1'); // unchanged when the server does not rotate it
  expect(calls.map((c) => c.url.replace(/^.*\/api/, ''))).toEqual(['/emissions/', '/auth/refresh/', '/emissions/']);
});

test('several requests failing together trigger only one refresh', async () => {
  tokens.set({ access: 'old', refresh: 'r1' });
  const calls = fakeNetwork({
    '/auth/refresh/': () => [200, { access: 'new' }],
    '/emissions/': (c) => (bearer(c) === 'Bearer new' ? [200, []] : [401, {}]),
  });

  await Promise.all([api.get('/emissions/'), api.get('/emissions/summary/')]);

  expect(calls.filter((c) => c.url.includes('/auth/refresh/'))).toHaveLength(1);
});

test('a rotated refresh token is stored', async () => {
  tokens.set({ access: 'old', refresh: 'r1' });
  fakeNetwork({
    '/auth/refresh/': () => [200, { access: 'new', refresh: 'r2' }],
    '/emissions/': (c) => (bearer(c) === 'Bearer new' ? [200, []] : [401, {}]),
  });
  await api.get('/emissions/');
  expect(tokens.refresh()).toBe('r2');
});

test('when the refresh token is also rejected the user is logged out', async () => {
  tokens.set({ access: 'old', refresh: 'bad' });
  fakeNetwork({
    '/auth/refresh/': () => [401, { detail: 'Token is invalid' }],
    '/emissions/': () => [401, {}],
  });
  const onLogout = jest.fn();
  window.addEventListener(LOGOUT_EVENT, onLogout);

  await expect(api.get('/emissions/')).rejects.toBeTruthy();

  expect(tokens.access()).toBeNull();
  expect(tokens.refresh()).toBeNull();
  expect(onLogout).toHaveBeenCalledTimes(1);
  window.removeEventListener(LOGOUT_EVENT, onLogout);
});

test('a 401 with no refresh token logs out without calling the refresh endpoint', async () => {
  tokens.set({ access: 'old' });
  const calls = fakeNetwork({ '/emissions/': () => [401, {}] });
  const onLogout = jest.fn();
  window.addEventListener(LOGOUT_EVENT, onLogout);

  await expect(api.get('/emissions/')).rejects.toBeTruthy();

  expect(calls).toHaveLength(1);
  expect(onLogout).toHaveBeenCalledTimes(1);
  window.removeEventListener(LOGOUT_EVENT, onLogout);
});

test('a failed Google login (401) is not treated as an expired session', async () => {
  tokens.set({ access: 'a', refresh: 'r' });
  const calls = fakeNetwork({ '/auth/google/': () => [401, { error: 'Invalid Google token.' }] });
  const onLogout = jest.fn();
  window.addEventListener(LOGOUT_EVENT, onLogout);

  await expect(api.post('/auth/google/', { id_token: 'x' })).rejects.toBeTruthy();

  expect(calls).toHaveLength(1);
  expect(onLogout).not.toHaveBeenCalled();
  window.removeEventListener(LOGOUT_EVENT, onLogout);
});

describe('errorMessage', () => {
  const err = (data, status = 400) => ({ response: { status, data } });

  test('prefers the server error text', () => {
    expect(errorMessage(err({ error: 'Record is locked for audit' }))).toBe('Record is locked for audit');
    expect(errorMessage(err({ detail: 'Not found.' }, 404))).toBe('Not found.');
  });

  test('reads DRF field errors', () => {
    expect(errorMessage(err({ company: ['This field is required.'] }))).toBe('company: This field is required.');
  });

  test('falls back for network errors and HTML error pages', () => {
    expect(errorMessage({ message: 'Network Error' })).toBe('Cannot reach the server.');
    expect(errorMessage(err('<html>500</html>', 500), 'Fallback')).toBe('Fallback');
  });
});
