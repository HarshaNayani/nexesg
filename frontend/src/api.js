import axios from 'axios';

// Set REACT_APP_API_URL in frontend/.env.local (dev) or your host's env (prod).
const FALLBACK =
  process.env.NODE_ENV === 'production'
    ? 'https://breathe-esg-5hgc.onrender.com/api'
    : 'http://localhost:8000/api';
export const API_URL = (process.env.REACT_APP_API_URL || FALLBACK).replace(/\/$/, '');

const ACCESS_KEY = 'besg_access';
const REFRESH_KEY = 'besg_refresh';

// localStorage can throw (private windows, blocked storage), so never trust it.
const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

export const tokens = {
  access: () => read(ACCESS_KEY),
  refresh: () => read(REFRESH_KEY),
  set: ({ access, refresh }) => {
    if (access) write(ACCESS_KEY, access);
    if (refresh) write(REFRESH_KEY, refresh);
  },
  clear: () => {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
};

export const LOGOUT_EVENT = 'besg:logout';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const access = tokens.access();
  if (access) config.headers.Authorization = `Bearer ${access}`;
  return config;
});

// One refresh at a time, even if several requests fail together.
let refreshing = null;
const refreshAccessToken = () => {
  if (!refreshing) {
    const refresh = tokens.refresh();
    refreshing = axios
      .post(`${API_URL}/auth/refresh/`, { refresh })
      .then((res) => {
        tokens.set({ access: res.data.access, refresh: res.data.refresh });
        return res.data.access;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const { config, response } = error;
    const isAuthCall = config?.url?.includes('/auth/');
    if (response?.status === 401 && config && !config._retried && !isAuthCall && tokens.refresh()) {
      config._retried = true;
      try {
        const access = await refreshAccessToken();
        config.headers.Authorization = `Bearer ${access}`;
        return api(config);
      } catch {
        tokens.clear();
        window.dispatchEvent(new Event(LOGOUT_EVENT));
      }
    } else if (response?.status === 401 && !isAuthCall) {
      tokens.clear();
      window.dispatchEvent(new Event(LOGOUT_EVENT));
    }
    return Promise.reject(error);
  }
);

// Turn an axios error into one readable sentence.
export const errorMessage = (err, fallback = 'Something went wrong. Please try again.') => {
  const data = err?.response?.data;
  if (!data) return err?.message === 'Network Error' ? 'Cannot reach the server.' : fallback;
  if (typeof data === 'string') return fallback;
  if (data.error) return data.error;
  if (data.detail) return data.detail;
  const first = Object.entries(data)[0];
  if (first) {
    const [field, msg] = first;
    return `${field}: ${Array.isArray(msg) ? msg[0] : msg}`;
  }
  return fallback;
};

export default api;
