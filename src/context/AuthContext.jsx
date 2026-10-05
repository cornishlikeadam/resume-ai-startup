/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../services/api";
const AuthContext = createContext();
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    [
      "token",
      "resume_ai_token",
      "resume_ai_user",
      "resume_ai_jobs",
      "resume_ai_applications",
      "resume_ai_tailored",
      "resume_ai_sms_leads",
    ].forEach((key) => localStorage.removeItem(key));
    api
      .getProfile()
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function logout() {
    await api.logout();
    setUser(null);
  }
  return (
    <AuthContext.Provider value={{ user, loading, login: setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
