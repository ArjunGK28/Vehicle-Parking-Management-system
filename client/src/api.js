// Thin wrapper around fetch for the JSON API.
// Throws ApiError with the server's message and per-field errors on failure.
export class ApiError extends Error {
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// Fired when a protected call is refused because the session ended (NFR-14).
export const SESSION_EXPIRED_EVENT = 'session-expired';

// options.background: true marks a refresh the page does by itself. The server then
// does not count it as activity, so an idle session still expires after 15 minutes.
async function request(method, path, body, { background = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (background) headers['X-Background-Refresh'] = 'true';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that it is running.');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // A 401 on anything except the login calls means the session has ended.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(res.status, data.error || 'Request failed', data.fields);
  }
  return data;
}

export const api = {
  register: (details) => request('POST', '/auth/register', details),
  login: (credentials) => request('POST', '/auth/login', credentials),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me'),
  // filters: { status, type }; empty values are left out. Returns { slots, counts }.
  listSlots: (filters = {}, options) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    const query = params.toString();
    return request('GET', `/slots${query ? `?${query}` : ''}`, undefined, options);
  },
  addSlot: (slot) => request('POST', '/slots', slot),
  setSlotDisabled: (id, disabled) => request('PATCH', `/slots/${id}`, { disabled }),
  listRates: () => request('GET', '/rates'),
  saveRate: (type, rate) => request('PUT', `/rates/${type}`, rate),
  // FR-07: attendants and admins find where a vehicle is parked.
  locateVehicle: (registrationNumber) =>
    request('GET', `/parking/locate?registrationNumber=${encodeURIComponent(registrationNumber)}`),
  // FR-05: the attendant records entry by registration number.
  enterVehicle: (registrationNumber) => request('POST', '/parking/entry', { registrationNumber }),
};