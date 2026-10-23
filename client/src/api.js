// Thin wrapper around fetch for the JSON API.
// Throws ApiError with the server's message and per-field errors on failure.
export class ApiError extends Error {
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that it is running.');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Request failed', data.fields);
  return data;
}

export const api = {
  register: (details) => request('POST', '/auth/register', details),
  login: (credentials) => request('POST', '/auth/login', credentials),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me'),
  listSlots: () => request('GET', '/slots'),
  addSlot: (slot) => request('POST', '/slots', slot),
  setSlotDisabled: (id, disabled) => request('PATCH', `/slots/${id}`, { disabled }),
  listRates: () => request('GET', '/rates'),
  saveRate: (type, rate) => request('PUT', `/rates/${type}`, rate),
};
