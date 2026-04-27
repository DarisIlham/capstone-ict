import {
  Activity,
  BrainCircuit,
  ChevronDown,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import logo from "../assets/Undip.svg";

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, setTransitionLoading } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const handleNavigation = (href) => {
    setTransitionLoading(true);
    setIsMenuOpen(false);
    navigate(href);
  };

  const handleLogout = () => {
    logout();
    setTransitionLoading(true);
    navigate("/login");
  };

  const baseMenuItems = [
    { label: "Main Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Machine Learning", href: "/ml-dashboard", icon: BrainCircuit },
    { label: "File Integrity Monitoring", href: "/fim-events", icon: ShieldAlert },
    { label: "Host Monitoring", href: "/attack-dashboard", icon: Activity },
    { label: "File Security Scanner", href: "/file-security", icon: FileSearch },
  ];

  const menuItems = baseMenuItems;

  return (
    <>
      {/* Navbar */}
      <nav className="bg-slate-900 border-b border-slate-700/80 sticky top-0 z-40 backdrop-blur-xl">
        <div className="pl-8 pr-6">
          <div className="flex justify-between items-center h-24">
            {/* Hamburger Menu + Logo & Brand */}
            <div className="flex items-center gap-8">
              {/* Hamburger Menu Button */}
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {isMenuOpen ? (
                  <X className="h-7 w-7" />
                ) : (
                  <Menu className="h-7 w-7" />
                )}
              </button>

              {/* Logo & Brand */}
              <div className="flex items-center gap-3">
                <img src={logo} alt="Logo" className="h-20 w-20 object-contain" />
                <div>
                  <h2 className="text-white font-bold text-xl mb-2">Cyber Monitoring Dashboard</h2>
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-800/80 text-slate-300 px-2.5 py-0.5 rounded-full text-[9px] border border-slate-600">
                      File Integrity Monitoring
                    </span>
                    
                  </div>
                </div>
              </div>
            </div>

            {/* User Info Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-800/60 transition-colors text-slate-300 hover:text-white"
              >
                <div className="text-right">
                  <p className="text-sm font-medium text-white">{user?.name || user?.email}</p>
                  <p className="text-xs text-slate-400">{user?.email || "Signed in account"}</p>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${isUserDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {/* User Dropdown Menu */}
              {isUserDropdownOpen && (
                <>
                  {/* Overlay */}
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsUserDropdownOpen(false)}
                  />
                  
                  {/* Dropdown Content */}
                  <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-40 backdrop-blur-xl">
                    {/* User Info */}
                    <div className="p-4 border-b border-slate-700/50">
                      <p className="text-white font-medium mb-1">{user?.name || user?.email}</p>
                      <p className="text-sm text-slate-400 mb-3">{user?.email}</p>
                      <div className="flex items-center gap-2">
                        {user?.status === "pending" && (
                          <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Menu Items */}
                    {user?.role === "admin" && (
                      <>
                        <button
                          onClick={() => {
                            handleNavigation("/users");
                            setIsUserDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-3 text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors flex items-center gap-2 border-b border-slate-700/50 font-medium"
                        >
                          <Users className="h-4 w-4" />
                          User Management
                        </button>
                      </>
                    )}

                    {/* Logout Button */}
                    <button
                      onClick={() => {
                        handleLogout();
                        setIsUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-2 font-medium"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar Menu */}
      {isMenuOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/40 z-20"
            onClick={() => setIsMenuOpen(false)}
          />
          
          {/* Sidebar */}
          <div className="fixed left-0 top-24 h-[calc(100vh-6rem)] w-72 bg-slate-900/95 border-r border-slate-700/80 z-30 overflow-y-auto backdrop-blur-xl">
            {/* Menu Items */}
            <div className="p-4 space-y-2">
              {menuItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <button
                    key={item.href}
                    onClick={() => handleNavigation(item.href)}
                    className={`block w-full text-left px-4 py-3 rounded-lg transition-colors font-medium flex items-center gap-2 ${
                      isActive
                        ? "bg-sky-600/20 text-sky-400 border border-sky-600/50"
                        : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    {item.icon && <item.icon className="h-4 w-4" />}
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* User Info & Logout */}
            <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700/80 bg-slate-900/90 p-4 space-y-3 backdrop-blur-xl">
              <div>
                <p className="text-white font-medium">{user?.name || user?.email}</p>
                <p className="mt-1 text-xs text-slate-400">{user?.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  {user?.status === "pending" && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30">
                      Pending
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  handleLogout();
                  setIsMenuOpen(false);
                }}
                className="w-full flex items-center justify-start gap-2 px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors font-medium"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Navbar;
