import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import ClinicPage from "./pages/ClinicPage.jsx";
import IncomePage from "./pages/IncomePage.jsx";
import AddIncomePage from "./pages/AddIncomePage.jsx";
import OutcomePage from "./pages/OutcomePage.jsx";
import AddOutcomePage from "./pages/AddOutcomePage.jsx";
import StaffPage from "./pages/StaffPage.jsx";
import DoctorPage from "./pages/DoctorPage.jsx";
import StaffRolePage from "./pages/StaffRolePage.jsx";
import StaffIncomeDashboard from "./pages/StaffIncomeDashboard.jsx";
import DayDashboardPage from "./pages/DayDashboardPage.jsx";
import SchedulePage from "./pages/SchedulePage.jsx";
import SalaryReportPage from "./pages/SalaryReportPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import Layout from "./components/Layout.jsx";

const AuthContext = createContext(null);

function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("auth_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem("auth_token") || null);

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem("auth_token", newToken);
    localStorage.setItem("auth_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setToken(null);
    setUser(null);
  }, []);

  // If an API call returns 401, log the user out
  useEffect(() => {
    function handleUnauthorized(e) {
      if (e.detail?.status === 401) {
        logout();
      }
    }
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [logout]);

  const value = { user, token, login, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function AppRoutes() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && window.location.pathname === "/") {
      navigate("/clinic", { replace: true });
    }
  }, [navigate, user]);

  if (!user) {
    return <LoginPage onLogin={login} />;
  }

  return (
    <Layout onLogout={logout}>
      <Routes>
        <Route path="/clinic" element={<ClinicPage />} />
        <Route path="/income" element={<IncomePage />} />
        <Route path="/income/add" element={<AddIncomePage />} />
        <Route path="/income/edit/:id" element={<AddIncomePage />} />
        <Route path="/outcome" element={<OutcomePage />} />
        <Route path="/outcome/add" element={<AddOutcomePage />} />
        <Route path="/outcome/salary-report" element={<SalaryReportPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/staff/doctor/:id" element={<DoctorPage />} />
        <Route path="/staff/role/:id" element={<StaffRolePage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/my-income" element={<StaffIncomeDashboard />} />
        <Route path="/clinic/day/:date" element={<DayDashboardPage />} />
        <Route path="*" element={<Navigate to="/clinic" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export { useAuth };
