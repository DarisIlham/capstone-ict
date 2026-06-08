import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import PrivateRoute from "./components/PrivateRoute";
import LoginPage from "./pages/LoginPage.jsx";
import MainDashboard from "./pages/MainDashboard.jsx";
import MlDashboard from "./pages/MlDashboard.jsx";
import FimEvents from "./pages/FimEvents";
import AttackDashboard from "./pages/AttackDashboard.jsx";
import FileSecurityScanner from "./pages/FileSecurityScanner.jsx";
import UserManagement from "./pages/UserManagement.jsx";
import WebDefacement from "./pages/WebDefacement.jsx";

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
            {/* Protected Routes */}
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <MainDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/ml-dashboard"
              element={
                <PrivateRoute>
                  <MlDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/fim-events"
              element={
                <PrivateRoute>
                  <FimEvents />
                </PrivateRoute>
              }
            />
            <Route
              path="/attack-dashboard"
              element={
                <PrivateRoute>
                  <AttackDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/file-security"
              element={
                <PrivateRoute>
                  <FileSecurityScanner />
                </PrivateRoute>
              }
            />
            <Route
              path="/web-defacement"
              element={
                <PrivateRoute>
                  <WebDefacement />
                </PrivateRoute>
              }
            />
            <Route
              path="/users"
              element={
                <PrivateRoute requiredRole="admin">
                  <UserManagement />
                </PrivateRoute>
              }
            />
            
            {/* Catch all - redirect ke login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
