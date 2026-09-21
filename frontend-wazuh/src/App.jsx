import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import PrivateRoute from "./components/PrivateRoute";
import AppLayout from "./components/AppLayout";
import LoginPage from "./pages/LoginPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import MainDashboard from "./pages/MainDashboard.jsx";
import MlDashboard from "./pages/MlDashboard.jsx";
import FimEvents from "./pages/FimEvents.jsx";
import AttackDashboard from "./pages/AttackDashboard.jsx";
import FileSecurityScanner from "./pages/FileSecurityScanner.jsx";
import UserManagement from "./pages/UserManagement.jsx";
import Alert from "./pages/Alert.jsx";
import HostMonitoring from "./pages/HostMonitoring.jsx";

function App() {
  const routerBasename =
    import.meta.env.BASE_URL && import.meta.env.BASE_URL !== "/"
      ? import.meta.env.BASE_URL.replace(/\/$/, "")
      : undefined;

  return (
    <ThemeProvider>
      <AuthProvider>
        <Router basename={routerBasename}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protected Routes with Layout */}
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <AppLayout>
                    <MainDashboard />
                  </AppLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/alerts"
              element={
                <PrivateRoute>
                  <AppLayout>
                    <Alert />
                  </AppLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/attack-dashboard"
              element={
                <PrivateRoute>
                  <AppLayout>
                    <AttackDashboard />
                  </AppLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/host-monitoring"
              element={
                <PrivateRoute>
                  <AppLayout>
                    <HostMonitoring />
                  </AppLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/fim-events"
              element={
                <PrivateRoute>
                  <AppLayout>
                    <FimEvents />
                  </AppLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/file-security"
              element={
                <PrivateRoute>
                  <AppLayout>
                    <FileSecurityScanner />
                  </AppLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/ml-dashboard"
              element={
                <PrivateRoute>
                  <AppLayout>
                    <MlDashboard />
                  </AppLayout>
                </PrivateRoute>
              }
            />
            <Route
              path="/users"
              element={
                <PrivateRoute requiredRole="admin">
                  <AppLayout>
                    <UserManagement />
                  </AppLayout>
                </PrivateRoute>
              }
            />

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
