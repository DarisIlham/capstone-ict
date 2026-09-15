import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldAlert,
  Activity,
  FileSearch,
  BrainCircuit,
  Bell,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import ThemeToggle from "./ThemeToggle";
import logo from "../assets/UndipCyber.png";

const NAV_GROUPS = [
  {
    label: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Alerts", href: "/alerts", icon: Bell },
    ],
  },
  {
    label: "DETECTION",
    items: [
      { label: "Host Monitoring", href: "/attack-dashboard", icon: Activity },
      { label: "File Integrity", href: "/fim-events", icon: ShieldAlert },
      { label: "File Security", href: "/file-security", icon: FileSearch },
      { label: "ML Detection", href: "/ml-dashboard", icon: BrainCircuit },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { label: "User Management", href: "/users", icon: Users, adminOnly: true },
    ],
  },
];

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "1"
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleNav = (href) => {
    navigate(href);
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    navigate("/login");
  };

  const sidebarWidth = collapsed ? "w-16" : "w-60";

  const SidebarContent = ({ isMobile = false }) => (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Logo */}
      <div
        className={`flex items-center ${isMobile ? "gap-2 px-3 h-14" : "gap-2.5 px-4 h-16"} border-b border-slate-700/50 shrink-0 ${
          collapsed && !isMobile ? "justify-center px-0" : ""
        }`}
      >
        <div
          className={`flex items-center justify-center shrink-0 ${
            isMobile ? "w-8 h-8" : "w-9 h-9"
          }`}
        >
          <img
            src={logo}
            alt="Logo"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
            }}
          />
        </div>
        {(!collapsed || isMobile) && (
          <div className="min-w-0">
            <div className={`${isMobile ? "text-[11px]" : "text-xs"} font-bold text-[var(--soc-text-primary)] truncate`}>SOC UNDIP</div>
            {!isMobile && <div className="text-[10px] text-slate-500 truncate">Security Operations Center UNDIP</div>}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${isMobile ? "py-2 px-1.5" : "py-3 px-2"}`}>
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || user?.role === "admin"
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-4">
              {(!collapsed || isMobile) && (
                <div className={`${isMobile ? "px-1.5 mb-1 text-[9px]" : "px-2 mb-1.5 text-[10px]"} font-semibold text-slate-600 uppercase tracking-wider`}>
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <button
                      key={item.href}
                      onClick={() => handleNav(item.href)}
                      title={collapsed && !isMobile ? item.label : undefined}
                      className={`w-full flex items-center rounded-lg font-medium transition-all duration-150 ${isMobile ? "gap-1.5 px-1.5 py-1 text-[11px]" : "gap-2.5 px-2.5 py-2 text-[13px]"} ${
                        collapsed && !isMobile ? "justify-center px-0" : ""
                      } ${
                        isActive
                          ? "bg-sky-600/15 text-sky-400 border border-sky-600/20"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
                      }`}
                    >
                      <item.icon
                        className={`${isMobile ? "h-3 w-3" : "h-4 w-4"} shrink-0 ${
                          isActive ? "text-sky-400" : "text-slate-500"
                        }`}
                      />
                      {(!collapsed || isMobile) && <span>{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom section — pinned footer, never shrinks or scrolls away */}
      <div className="border-t border-slate-700/50 p-2 space-y-1 shrink-0 mt-auto">
        {(!collapsed || isMobile) && (
          <div className="px-2.5 py-2">
            <p className="text-xs font-medium text-[var(--soc-text-primary)] truncate">
              {user?.name || user?.email}
            </p>
            <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            {user?.role === "admin" && (
              <span className="inline-flex items-center mt-1 px-1.5 py-0.5 text-[9px] font-semibold rounded bg-sky-500/15 text-sky-400 border border-sky-500/20">
                Admin
              </span>
            )}
          </div>
        )}
        <button
          onClick={handleLogoutClick}
          title={collapsed && !isMobile ? "Logout" : undefined}
          className={`w-full flex items-center rounded-lg font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors ${isMobile ? "gap-1.5 px-1.5 py-1 text-[11px]" : "gap-2.5 px-2.5 py-2 text-[13px]"} ${
            collapsed && !isMobile ? "justify-center px-0" : ""
          }`}
        >
          <LogOut className={`${isMobile ? "h-3 w-3" : "h-4 w-4"} shrink-0`} />
          {(!collapsed || isMobile) && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--soc-bg)]">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col ${sidebarWidth} bg-[var(--soc-surface)] border-r border-[var(--soc-border)] transition-all duration-200 shrink-0`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="soc-mobile-drawer fixed left-0 top-0 bottom-0 w-48 max-w-[80vw] max-h-[100dvh] bg-[var(--soc-surface)] border-r border-[var(--soc-border)] z-50 lg:hidden animate-slide-in-left flex flex-col min-h-0 min-w-0">
            <div className="flex items-center justify-end p-2 shrink-0">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarContent isMobile />
          </aside>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="soc-topbar flex items-center justify-between h-12 px-3 sm:px-4 bg-[var(--soc-surface)] border-b border-[var(--soc-border)] shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setMobileOpen(true);
                } else {
                  setCollapsed(!collapsed);
                }
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors shrink-0"
            >
              {mobileOpen ? (
                <X className="h-5 w-5" />
              ) : collapsed ? (
                <ChevronRight className="h-5 w-5" />
              ) : (
                <ChevronLeft className="h-5 w-5" />
              )}
            </button>
            <div className="block min-w-0 truncate whitespace-nowrap text-[9.5px] min-[390px]:text-[10px] min-[550px]:text-[10.5px] md:text-xs text-slate-500">
              <span className="soc-topbar-date-full">
                {new Date().toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span className="soc-topbar-date-short">
                {new Date().toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle compact className="!border-slate-700/50 !bg-slate-800/40" />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <div className="soc-container py-3 sm:py-3.5">
            {children}
          </div>
        </main>
      </div>

      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-5 max-w-sm w-full">
            <h2 className="text-base md:text-lg font-bold text-white mb-2">Confirm Logout</h2>
            <p className="text-sm text-slate-400 mb-5">Are you sure you want to log out?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 text-xs font-medium rounded-lg text-slate-300 border border-[var(--soc-border)] hover:bg-slate-700/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
