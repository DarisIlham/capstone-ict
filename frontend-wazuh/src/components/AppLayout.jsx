import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldAlert,
  Activity,
  FileSearch,
  BrainCircuit,
  Radar,
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
import { useAlarms } from "../context/AlarmContext";
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
      { label: "Bot Detection", href: "/bot-detection", icon: Radar },
    ],
  },
  {
    label: "ADMINISTRATION",
    items: [
      { label: "User Management", href: "/users", icon: Users, adminOnly: true },
    ],
  },
];

// Panel riwayat alarm yang muncul dari ikon lonceng di topbar.
const AlarmPanel = ({ history, onClose, onClear, onViewAll, onOpenItem }) => {
  const ref = useRef(null);

  // Klik di luar atau tekan Escape menutup panel.
  useEffect(() => {
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1.5 w-[340px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--soc-border)] shadow-2xl overflow-hidden z-[80] animate-fadeInUp"
      style={{ background: "var(--soc-card)" }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--soc-border)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-pink-500/10 shrink-0">
            <Bell className="h-3.5 w-3.5 text-pink-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[11px] font-semibold text-[var(--soc-text-primary)]">Alarm History</h3>
            <p className="text-[9px] text-[var(--soc-text-muted)]">
              {history.length > 0 ? `${history.length} recorded alarm${history.length > 1 ? "s" : ""}` : "No alarm recorded"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close alarm history"
          className="p-1 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto">
        {history.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <Bell className="h-5 w-5 text-[var(--soc-text-muted)] mx-auto mb-2 opacity-50" />
            <p className="text-[10px] text-[var(--soc-text-muted)]">No critical alerts yet</p>
            <p className="text-[9px] text-[var(--soc-text-muted)] mt-0.5 opacity-70">Alarms appear here when they arrive</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--soc-border)]">
            {history.map((item) => {
              const isBotnet = item.source === "Bot Detection";
              const Icon = isBotnet ? Radar : ShieldAlert;
              return (
                <li key={item.id || item.key}>
                  <button
                    type="button"
                    onClick={() => onOpenItem(item.link)}
                    className="flex items-start gap-2 w-full text-left px-3 py-2.5 hover:bg-[var(--soc-elevated)] transition-colors"
                  >
                    <div className="p-1 rounded-lg bg-red-500/10 shrink-0">
                      <Icon className="h-3 w-3 text-red-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] font-medium text-[var(--soc-text-primary)] break-words">{item.title}</p>
                      <p className="text-[9px] text-[var(--soc-text-muted)] mt-0.5 truncate">
                        {item.source} &middot; {item.asset}
                      </p>
                      <p className="text-[8px] text-[var(--soc-text-muted)] mt-0.5 opacity-70">
                        {item.seenAt ? new Date(item.seenAt).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--soc-border)]">
        <button
          onClick={onViewAll}
          className="flex-1 rounded-lg px-3 py-1.5 text-[10px] font-semibold text-purple-300 hover:bg-purple-500/15 border border-purple-500/30 transition-colors"
        >
          View all alerts
        </button>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-[var(--soc-text-muted)] hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
};

export default function AppLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const { history, unread, panelOpen, togglePanel, closePanel, clearHistory } = useAlarms();
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
            className="w-7 h-7 object-contain"
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[65] lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="soc-mobile-drawer fixed left-0 top-0 bottom-0 w-56 max-w-[85vw] max-h-[100dvh] bg-[var(--soc-sidebar-bg)] z-[70] lg:hidden animate-slide-in-left flex flex-col min-h-0 min-w-0 shadow-[4px_0_24px_rgba(0,0,0,0.4)]">
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
            {/* Ikon lonceng membuka daftar riwayat alarm, bukan navigasi ke
                halaman /alerts. Halaman penuh tetap tersedia lewat "View all". */}
            <div className="relative">
              <button
                type="button"
                aria-label={`Alarm history${unread > 0 ? `, ${unread} unread` : ""}`}
                aria-expanded={panelOpen}
                title="Alarm history"
                onClick={togglePanel}
                className="p-1.5 rounded-lg text-[var(--soc-text-muted)] hover:text-[var(--soc-text-primary)] hover:bg-[var(--soc-elevated)] transition-colors relative"
              >
                <Bell className="h-4 w-4" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-pink-500 text-white text-[8px] font-bold flex items-center justify-center">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
              {panelOpen && (
                <AlarmPanel
                  history={history}
                  onClose={closePanel}
                  onClear={clearHistory}
                  onViewAll={() => { closePanel(); navigate("/alerts"); }}
                  onOpenItem={(href) => { closePanel(); navigate(href || "/alerts"); }}
                />
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden relative">
          <div className="soc-container py-3 px-4">
            {children}
          </div>
        </main>
      </div>

      {/* Logout Confirmation — same design concept as the Add User popup */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-3xl p-6 md:p-7 max-w-md w-full min-h-[340px] flex flex-col overflow-hidden">
            <div className="h-1 -mx-6 md:-mx-7 -mt-6 md:-mt-7 mb-6 bg-gradient-to-r from-red-500 to-pink-500" />
            <div className="relative flex flex-1 flex-col items-center justify-center text-center pt-2 mb-6">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="absolute right-0 top-0 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[var(--soc-elevated)] transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="p-6 rounded-3xl bg-gradient-to-br from-red-500 to-pink-500 mx-auto">
                <LogOut className="h-12 w-12 text-white" />
              </div>
              <h2 className="text-xl font-bold text-[var(--soc-text-primary)] leading-tight mt-4">Confirm Logout</h2>
              <p className="text-sm text-[var(--soc-text-muted)] mt-1.5">Are you sure you want to log out?</p>
            </div>
            <div className="flex gap-3 pt-2 mt-auto">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2.5 bg-[var(--soc-elevated)] hover:brightness-125 border border-[var(--soc-border)] text-slate-200 rounded-2xl text-xs font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-pink-500 hover:brightness-110 text-white rounded-2xl text-xs font-semibold transition-all"
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
