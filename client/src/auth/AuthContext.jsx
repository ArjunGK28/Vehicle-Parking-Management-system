import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { api, SESSION_EXPIRED_EVENT } from '../api.js';

const AuthContext = createContext(null);

// Holds the logged-in user. On load it asks the server whether the
// session cookie is still valid, so a page refresh keeps the user logged in.
// If the server later ends the session (15 minutes idle, NFR-14), the user is cleared
// and sessionExpired is set, so RequireAuth sends them to the login page.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    function onExpired() {
      if (!userRef.current) return;
      setSessionExpired(true);
      setUser(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  async function login(credentials) {
    const data = await api.login(credentials);
    setSessionExpired(false);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await api.logout().catch(() => {});
    setSessionExpired(false);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, checking, sessionExpired, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}