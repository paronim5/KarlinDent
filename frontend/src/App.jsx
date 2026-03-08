import { useEffect, createContext } from "react";
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
import Layout from "./components/Layout.jsx";

const AuthContext = createContext(null);

function useAuth() {
  // Auth removed: Return a mock admin user
  return {
    user: { id: 1, first_name: "Admin", last_name: "User", role: "admin" },
    token: "mock-token",
    login: () => {},
    logout: () => {}
  };
}

function AuthProvider({ children }) {
  const value = useAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    // Initial redirect to clinic if at root
    if (window.location.pathname === "/") {
      navigate("/clinic", { replace: true });
    }
  }, [navigate]);

  return (
    <Layout>
      <Routes>
        <Route path="/clinic" element={<ClinicPage />} />
        <Route path="/income" element={<IncomePage />} />
        <Route path="/income/add" element={<AddIncomePage />} />
        <Route path="/income/edit/:id" element={<AddIncomePage />} />
        <Route path="/outcome" element={<OutcomePage />} />
        <Route path="/outcome/add" element={<AddOutcomePage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/staff/doctor/:id" element={<DoctorPage />} />
        <Route path="/staff/role/:id" element={<StaffRolePage />} />
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

