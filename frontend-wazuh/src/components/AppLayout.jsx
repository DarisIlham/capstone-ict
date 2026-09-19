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
  Settings,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import ThemeToggle from "./ThemeToggle";
import logoDark from "../assets/soc_undip_dark_theme.png";
import logoLight from "../assets/soc_undip_light_theme.png";
import logoCollapsed from "../assets/logo_soc_undip.png";

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
  const { theme } = useTheme();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "1"
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(() => NAV_GROUPS.map(g => g.label));

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

  const toggleGroup = (label) => {
    setExpandedGroups(prev => 
      prev.includes(label) 
        ? prev.filter(g => g !== label)
        : [...prev, label]
    );
  };

  const sidebarWidth = collapsed ? "w-[60px]" : "w-[220px]";

  const SidebarContent = ({ isMobile = false }) => (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-[var(--soc-sidebar-bg)]">
      {/* Logo */}
      <div
        className={`flex items-center ${isMobile ? "gap-3 px-4 h-12" : "gap-3 px-4 h-[56px]"} shrink-0 ${
          collapsed && !isMobile ? "justify-center px-0" : ""
        }`}
      >
        {collapsed && !isMobile ? (
          <img
            src={logoCollapsed}
            alt="SOC UNDIP"
            className="w-10 h-10 object-contain"
          />
        ) : (
          <img
            src={theme === "light" ? logoLight : logoDark}
            alt="SOC UNDIP"
            className="h-10 object-contain"
          />
        )}
        {(!collapsed || isMobile) && (
          <></>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${isMobile ? "px-2" : collapsed ? "px-1.5" : "px-2"} py-1.5`}>
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || user?.role === "admin"
          );
          if (visibleItems.length === 0) return null;

          const isExpanded = expandedGroups.includes(group.label);

          return (
            <div key={group.label} className="mb-1.5">
              {(!collapsed || isMobile) ? (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-2 py-1.5 text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider hover:text-[var(--soc-text-secondary)] rounded-lg transition-all"
                >
                  <span>{group.label}</span>
                  <ChevronDown className={`h-2.5 w-2.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              ) : (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-center py-2 rounded-lg transition-colors"
                  title={group.label}
                >
                  <ChevronDown className={`h-4 w-4 text-[var(--soc-text-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              )}
              {((!collapsed || isMobile) ? isExpanded : true) && (
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <button
                        key={item.href}
                        onClick={() => handleNav(item.href)}
                        title={collapsed && !isMobile ? item.label : undefined}
                        className={`w-full flex items-center rounded-lg font-medium transition-all duration-200 ${
                          isMobile ? "gap-2 px-2 py-1.5 text-[11px]" : collapsed ? "justify-center px-0 py-2 text-[11px]" : "gap-2 px-2 py-1.5 text-[11px]"
                        } ${
                          isActive
                            ? "bg-[var(--soc-sidebar-active)] text-purple-400 border border-purple-500/20"
                            : "text-[var(--soc-text-secondary)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-sidebar-hover)] border border-transparent"
                        }`}
                      >
                        <item.icon
                          className={`h-3.5 w-3.5 shrink-0 ${
                            isActive ? "text-purple-400" : "text-[var(--soc-text-muted)]"
                          }`}
                        />
                        {(!collapsed || isMobile) && <span>{item.label}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom section — user profile */}
      <div className="border-t border-[var(--soc-border)] p-2 shrink-0 mt-auto">
        {(!collapsed || isMobile) ? (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--soc-sidebar-hover)] transition-colors cursor-pointer">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-[var(--soc-text-primary)] truncate">
                {user?.name || user?.email}
              </p>
              <p className="text-[8px] text-[var(--soc-text-muted)] truncate">{user?.email}</p>
            </div>
            {user?.role === "admin" && (
              <span className="px-1.5 py-0.5 text-[7px] font-semibold rounded bg-purple-500/15 text-purple-400 border border-purple-500/20">
                Admin
              </span>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold">
              {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
            </div>
          </div>
        )}
        <button
          onClick={handleLogoutClick}
          title={collapsed && !isMobile ? "Logout" : undefined}
          className={`w-full flex items-center rounded-lg font-medium text-[var(--soc-text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors mt-1.5 ${
            isMobile ? "gap-2 px-2 py-1.5 text-[11px]" : collapsed ? "justify-center px-0 py-1.5 text-[11px]" : "gap-2 px-2 py-1.5 text-[11px]"
          }`}
        >
          <LogOut className={`h-3.5 w-3.5 shrink-0`} />
          {(!collapsed || isMobile) && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--soc-bg)]">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col ${sidebarWidth} bg-[var(--soc-sidebar-bg)] transition-all duration-300 shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.3)]`}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="soc-mobile-drawer fixed left-0 top-0 bottom-0 w-56 max-w-[85vw] max-h-[100dvh] bg-[var(--soc-sidebar-bg)] z-50 lg:hidden animate-slide-in-left flex flex-col min-h-0 min-w-0 shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-end p-2 shrink-0">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-sidebar-hover)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent isMobile />
          </aside>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="soc-topbar flex items-center justify-between h-[52px] px-4 bg-[var(--soc-sidebar-bg)] shrink-0 z-[60]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setMobileOpen(true);
                } else {
                  setCollapsed(!collapsed);
                }
              }}
              className="p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors"
            >
              {mobileOpen ? (
                <X className="h-4 w-4" />
              ) : collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <button className="p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors relative">
              <Bell className="h-4 w-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-pink-500 rounded-full"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative">
          <div className="soc-container py-3 px-4">
            {children}
          </div>
        </main>
      </div>

      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-xl p-4 max-w-xs w-full shadow-2xl">
            <h2 className="text-sm font-bold text-[var(--soc-text-primary)] mb-1">Confirm Logout</h2>
            <p className="text-[11px] text-[var(--soc-text-secondary)] mb-4">Are you sure you want to log out?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-3 py-1.5 text-[11px] font-medium rounded-lg text-[var(--soc-text-secondary)] border border-[var(--soc-border)] hover:bg-[var(--soc-elevated)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-gradient-to-r from-red-500 to-pink-500 text-white hover:from-red-600 hover:to-pink-600 transition-all shadow-lg shadow-red-500/25"
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
