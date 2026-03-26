import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import LoginPage from "./pages/LoginPage.jsx";
import FimEvents from "./pages/FimEvents.jsx";
import ThreadHuntingEvents from "./pages/ThreadHuntingEvents.jsx";

function App() {
  return (
    <AuthProvider>
      <Router basename="/Capstone">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <FimEvents />
              </PrivateRoute>
            }
          />
          <Route
            path="/thread-hunting"
            element={
              <PrivateRoute>
                <ThreadHuntingEvents />
              </PrivateRoute>
            }
          />
          
          {/* Catch all - redirect ke login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;