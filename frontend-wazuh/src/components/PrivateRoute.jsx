import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useEffect } from "react";

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading, pageLoading, setTransitionLoading } = useAuth();

  useEffect(() => {
    // Set loading ke false setelah component render
    const timer = setTimeout(() => {
      setTransitionLoading(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [children, setTransitionLoading]);

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-cyan-500 mx-auto mb-4"></div>
          <p className="text-slate-300 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PrivateRoute;
