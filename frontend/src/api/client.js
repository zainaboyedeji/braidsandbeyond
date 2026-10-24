const BASE_URL = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'salon_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: session lasts until refresh
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Cloudinary photos are already full URLs; local /uploads/... paths need the API's base URL
export function assetUrl(path) {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${BASE_URL}${path}`;
}

async function request(method, path, body) {
  const isForm = body instanceof FormData;
  // FormData sets its own multipart Content-Type (with boundary)
  const headers = isForm ? {} : { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined || isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  upload: (path, formData) => request('POST', path, formData),
  del: (path) => request('DELETE', path),
};

// Last services list fetched, so pages opened right after the home page can show it instantly
let servicesCache = null;

export function cachedServices() {
  return servicesCache;
}

export async function fetchServices() {
  const data = await api.get('/services');
  servicesCache = data.services;
  return data.services;
}
