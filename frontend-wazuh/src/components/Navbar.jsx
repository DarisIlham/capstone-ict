import { LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import logo from "../assets/Undip.svg";

const Navbar = () => {
  const navigate = useNavigate();
  const { user, logout, setTransitionLoading } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  const menuItems = [
    { label: "File Integrity Monitoring", href: "/" },
    { label: "Thread Hunting", href: "/thread-hunting" },
  ];

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
                    <span className="bg-sky-900/50 text-sky-400 px-2.5 py-0.5 rounded-full text-[9px] border border-sky-800/60">
                      agent003
                    </span>
                  </div>
                </div>
              </div>
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
              {menuItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => handleNavigation(item.href)}
                  className="block w-full text-left px-4 py-3 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-lg transition-colors font-medium"
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* User Info & Logout */}
            <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700/80 bg-slate-900/90 p-4 space-y-3 backdrop-blur-xl">
              <div>
                <p className="text-white font-medium">{user?.name || user?.email}</p>
                <p className="text-slate-400 text-sm">Admin Wazuh</p>
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
