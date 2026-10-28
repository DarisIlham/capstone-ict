import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  addNewUser,
  deleteUserAccount,
  fetchAllUsers,
  restoreUserAccount,
  suspendUserAccount,
} from "../services/userApi";
import PageLoader from "../components/PageLoader";

// ── KPI Card: konsep desain ML (kpi-modern + stagger + fadeInUp) ───────────
// (hanya wrapper visual — nilai & label tetap milik User Management)
const KPICard = ({ label, value, icon: Icon, color, desc, loading, index = 0 }) => (
  <div className={`user-management-kpi-card kpi-modern animate-fadeInUp stagger-${index + 1}`} style={{ opacity: 0 }}>
    <div className="flex items-center justify-between mb-3">
      <span className="user-management-kpi-label text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{label}</span>
      <div className={`user-management-kpi-icon p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
    </div>
    <div className={`user-management-kpi-value text-xl font-bold ${color} mb-1`}>
      {loading ? <div className="skeleton h-6 w-16"></div> : value}
    </div>
    <div className="user-management-kpi-description text-[9px] text-[var(--soc-text-muted)]">{desc}</div>
  </div>
);

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [userStats, setUserStats] = useState({ total: 0, active: 0, pending: 0 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [currentPage]);

  useEffect(() => {
    const interval = setInterval(() => loadUsers(), 30000);
    return () => clearInterval(interval);
  }, [currentPage]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetchAllUsers(currentPage, 10);

      if (response.success) {
        setUsers(response.users);
        setTotalPages(response.pagination.pages);

        if (response.pagination.total > 0) {
          const statsResponse = await fetchAllUsers(1, response.pagination.total);

          if (statsResponse.success) {
            const activeUsers = statsResponse.users.filter((user) => user.status === "active").length;
            const pendingUsers = statsResponse.users.filter((user) => user.status === "pending").length;

            setUserStats({
              total: statsResponse.pagination.total,
              active: activeUsers,
              pending: pendingUsers,
            });
          }
        } else {
          setUserStats({ total: 0, active: 0, pending: 0 });
        }
      }
    } catch (err) {
      setError("Failed to load users: " + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.password) {
      setError("All fields are required");
      return;
    }

    setActionLoading(true);
    try {
      const response = await addNewUser(formData);
      if (response.success) {
        setSuccessMessage(`User '${formData.name}' was added successfully`);
        setFormData({ name: "", email: "", password: "" });
        setShowAddModal(false);
        setTimeout(() => loadUsers(), 500);
      }
    } catch (err) {
      setError("Failed to add user: " + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    setActionLoading(true);
    try {
      const response = await deleteUserAccount(selectedUser.id);
      if (response.success) {
        setSuccessMessage(response.message);
        setShowDeleteModal(false);
        setSelectedUser(null);
        setTimeout(() => loadUsers(), 500);
      }
    } catch (err) {
      setError("Failed to delete user: " + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspendUser = async (user) => {
    setSelectedUser(user);
    setShowSuspendModal(true);
  };

  const handleConfirmSuspend = async () => {
    if (!selectedUser) return;

    setActionLoading(true);
    try {
      const response = await suspendUserAccount(selectedUser.id, 120);
      if (response.success) {
        setSuccessMessage(response.message);
        setShowSuspendModal(false);
        setSelectedUser(null);
        setTimeout(() => loadUsers(), 500);
      }
    } catch (err) {
      setError("Failed to suspend user: " + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreUser = async (user) => {
    setActionLoading(true);
    try {
      const response = await restoreUserAccount(user.id);
      if (response.success) {
        setSuccessMessage(response.message);
        setTimeout(() => loadUsers(), 500);
      }
    } catch (err) {
      setError("Failed to restore user: " + (err.response?.data?.message || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const getRemainingTime = (pendingUntil) => {
    const now = new Date();
    const pending = new Date(pendingUntil);
    const diff = pending - now;

    if (diff <= 0) return null;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  };

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => setSuccessMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    if (!error) return undefined;
    const timer = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  return (
    <div className="user-management-page flex flex-col gap-4 w-full min-w-0">
      <div className="user-management-header flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="user-management-title text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">
            User Management
          </h1>
          <p className="user-management-subtitle text-[11px] text-[var(--soc-text-muted)] mt-0.5">
            Manage user accounts and monitor admin login activity
          </p>
        </div>
        <div className="user-management-header-actions flex items-center gap-2 w-full min-[700px]:w-auto shrink-0">
          <button
            onClick={() => setShowAddModal(true)}
            className="user-management-add-button flex items-center justify-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-600 w-full min-[700px]:w-fit"
          >
            <Plus className="h-3.5 w-3.5" />
            Add User
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] text-emerald-300">
          <p className="text-[11px] font-medium">Success: {successMessage}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-2 text-[11px] text-red-300">
          <p className="text-[11px] font-medium">Error: {error}</p>
        </div>
      )}

      <div className="user-management-kpi-grid grid grid-cols-1 min-[480px]:grid-cols-2 min-[1024px]:grid-cols-3 gap-3">
        <KPICard label="Total Accounts" value={new Intl.NumberFormat("en-US").format(userStats.total)} icon={Users} color="text-sky-400" desc="all registered users" loading={loading} index={0} />
        <KPICard label="Active Accounts" value={new Intl.NumberFormat("en-US").format(userStats.active)} icon={CheckCircle} color="text-emerald-400" desc="users with normal access" loading={loading} index={1} />
        <KPICard label="Pending Accounts" value={new Intl.NumberFormat("en-US").format(userStats.pending)} icon={Clock} color="text-amber-400" desc="users temporarily restricted" loading={loading} index={2} />
      </div>

      <div className="user-management-account-card bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg h-auto overflow-hidden animate-fadeInUp stagger-4" style={{ opacity: 0 }}>
        <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
          <div className="text-[11px] md:text-xs font-semibold text-slate-300">
            Account Overview
          </div>
        </div>
        <div className="user-management-account-content">
              {loading ? (
                <PageLoader message="Loading users..." size="sm" />
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <p className="text-sm text-slate-400 font-medium">No users found</p>
                </div>
              ) : (
                <>
                <div className="user-management-table-wrap hidden min-[640px]:block overflow-x-auto">
                <table className="user-management-table w-full min-w-[720px] text-[10px] md:text-[11px] text-left">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-800/70">
                      <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Name</th>
                      <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Email</th>
                      <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Role</th>
                      <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Status</th>
                      <th className="px-2 md:px-4 py-2 md:py-2.5 text-left text-[9px] md:text-[11px] font-semibold text-slate-400 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, idx) => {
                      const remainingTime = user.status === "pending" ? getRemainingTime(user.pendingUntil) : null;

                      return (
                        <tr key={user.id} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${idx % 2 !== 0 ? "bg-slate-900/30" : ""}`}>
                          <td className="px-2 md:px-4 py-1.5 md:py-2">
                            <div className="font-semibold text-slate-100">{user.name}</div>
                          </td>
                          <td className="px-2 md:px-4 py-1.5 md:py-2 text-slate-400">{user.email}</td>
                          <td className="px-2 md:px-4 py-1.5 md:py-2">
                            <span
                              className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] md:text-[10px] font-semibold ${
                                user.role === "admin"
                                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                                  : "border-slate-600 bg-slate-800 text-slate-300"
                              }`}
                            >
                              {user.role === "admin" ? "Admin" : "User"}
                            </span>
                          </td>
                          <td className="px-2 md:px-4 py-1.5 md:py-2">
                            <div className="flex items-center gap-1.5">
                              {user.status === "active" ? (
                                <>
                                  <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                  <span className="text-green-400 font-medium">Active</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="h-3.5 w-3.5 text-yellow-400" />
                                  <span className="text-yellow-400 font-medium">
                                    Pending
                                    {remainingTime && (
                                      <span className="text-[9px] md:text-[10px] text-yellow-300 ml-1">
                                        ({remainingTime.hours}h {remainingTime.minutes}m)
                                      </span>
                                    )}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-2 md:px-4 py-1.5 md:py-2">
                            <div className="flex items-center gap-1.5">
                              {user.status === "active" ? (
                                <button
                                  onClick={() => handleSuspendUser(user)}
                                  className="p-1.5 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
                                  title="Suspend for 2 hours"
                                  disabled={actionLoading}
                                >
                                  <Clock className="h-3.5 w-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRestoreUser(user)}
                                  className="p-1.5 hover:bg-green-500/20 text-green-400 rounded transition-colors"
                                  title="Restore from pending"
                                  disabled={actionLoading}
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowDeleteModal(true);
                                }}
                                className="p-1.5 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                                title="Delete user"
                                disabled={actionLoading}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                <div className="user-management-mobile-list min-[640px]:hidden">
                  {users.map((user) => {
                    const remainingTime = user.status === "pending" ? getRemainingTime(user.pendingUntil) : null;

                    return (
                      <article key={user.id} className="user-management-mobile-card">
                        <div className="user-management-mobile-card-header">
                          <div className="min-w-0">
                            <h3 className="user-management-mobile-name">{user.name}</h3>
                            <p className="user-management-mobile-email">{user.email}</p>
                          </div>
                          <div className="user-management-mobile-status">
                            {user.status === "active" ? (
                              <>
                                <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                                <span className="text-green-400 font-medium">Active</span>
                              </>
                            ) : (
                              <>
                                <Clock className="h-3.5 w-3.5 text-yellow-400" />
                                <span className="text-yellow-400 font-medium">
                                  Pending
                                  {remainingTime && ` (${remainingTime.hours}h ${remainingTime.minutes}m)`}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="user-management-mobile-card-footer">
                          <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${
                            user.role === "admin"
                              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                              : "border-slate-600 bg-slate-800 text-slate-300"
                          }`}>
                            {user.role === "admin" ? "Admin" : "User"}
                          </span>
                          <div className="flex items-center gap-1">
                            {user.status === "active" ? (
                              <button
                                onClick={() => handleSuspendUser(user)}
                                className="user-management-action-button text-yellow-400 hover:bg-yellow-500/20"
                                title="Suspend for 2 hours"
                                aria-label={`Suspend ${user.name} for 2 hours`}
                                disabled={actionLoading}
                              >
                                <Clock className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRestoreUser(user)}
                                className="user-management-action-button text-green-400 hover:bg-green-500/20"
                                title="Restore from pending"
                                aria-label={`Restore ${user.name}`}
                                disabled={actionLoading}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowDeleteModal(true);
                              }}
                              className="user-management-action-button text-red-400 hover:bg-red-500/20"
                              title="Delete user"
                              aria-label={`Delete ${user.name}`}
                              disabled={actionLoading}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                </>
              )}
        </div>

              {totalPages > 1 && (
                <div className="user-management-pagination border-t border-slate-800 bg-slate-900/50 px-2 md:px-4 py-3">
                  <div className="flex flex-col min-[520px]:flex-row items-start min-[520px]:items-center justify-between gap-2">
                    <div className="text-[10px] md:text-[11px] font-mono text-slate-500">
                      <span className="font-bold text-sky-400">PAGE </span>
                      <span className="font-bold text-white">{currentPage}</span> / {totalPages}
                    </div>
                    <div className="user-management-pagination-controls flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        PREV
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`min-w-[28px] rounded border px-2 py-1.5 text-[10px] md:text-[11px] font-bold transition-all ${
                            currentPage === page
                              ? "border-sky-600/50 bg-sky-600/20 text-sky-400"
                              : "border-slate-700 bg-slate-800 text-slate-300 hover:border-sky-500/50 hover:bg-sky-900/20"
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-[10px] md:text-[11px] font-bold text-slate-300 transition-all hover:border-sky-500/50 hover:bg-sky-900/20 disabled:cursor-not-allowed disabled:opacity-20"
                      >
                        NEXT
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4 animate-fadeInUp" onClick={() => setShowAddModal(false)}>
          <div role="alertdialog" aria-label="Add new user" onClick={(e) => e.stopPropagation()} className="user-management-modal bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-2xl p-7 w-full max-w-sm shadow-2xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/15">
              <UserPlus className="h-7 w-7 text-violet-500" />
            </div>
            <h2 className="text-[18px] font-bold text-[var(--soc-text-primary)] leading-relaxed mt-3">Add New User</h2>
            <p className="text-[13px] text-[var(--soc-text-muted)] leading-relaxed mt-1">Create a new account with access</p>
            <form onSubmit={handleAddUser} className="space-y-3 mt-5 text-left">
              <div>
                <label className="block text-[11px] text-[var(--soc-text-secondary)] font-medium mb-1.5">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--soc-text-primary)] placeholder-slate-500 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                  placeholder="Enter name"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[var(--soc-text-secondary)] font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--soc-text-primary)] placeholder-slate-500 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                  placeholder="Enter email"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[var(--soc-text-secondary)] font-medium mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-[var(--soc-elevated)] border border-[var(--soc-border)] rounded-xl px-3.5 py-2.5 pr-11 text-xs text-[var(--soc-text-primary)] placeholder-slate-500 focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-3 py-2.5 rounded-xl text-[12px] font-medium text-[var(--soc-text-secondary)] border border-[var(--soc-border)] hover:bg-[var(--soc-elevated)] transition-colors"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2.5 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={actionLoading}
                >
                  {actionLoading ? "Loading..." : "Add User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4 animate-fadeInUp" onClick={() => { setShowDeleteModal(false); setSelectedUser(null); }}>
          <div role="alertdialog" aria-label="Delete user" onClick={(e) => e.stopPropagation()} className="user-management-modal bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-2xl p-7 w-full max-w-sm shadow-2xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15">
              <AlertCircle className="h-7 w-7 text-red-500" />
            </div>
            <h2 className="text-[18px] font-bold text-[var(--soc-text-primary)] leading-relaxed mt-3">Delete User?</h2>
            <p className="text-[13px] text-[var(--soc-text-muted)] leading-relaxed mt-1">
              Delete <span className="font-semibold text-[var(--soc-text-primary)]">'{selectedUser.name}'</span>? This cannot be undone.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-3 py-2.5 rounded-xl text-[12px] font-medium text-[var(--soc-text-secondary)] border border-[var(--soc-border)] hover:bg-[var(--soc-elevated)] transition-colors"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="flex-1 px-3 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={actionLoading}
              >
                {actionLoading ? "Loading..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuspendModal && selectedUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-[100] p-4 animate-fadeInUp" onClick={() => { setShowSuspendModal(false); setSelectedUser(null); }}>
          <div role="alertdialog" aria-label="Suspend user" onClick={(e) => e.stopPropagation()} className="user-management-modal bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-2xl p-7 w-full max-w-sm shadow-2xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15">
              <Clock className="h-7 w-7 text-amber-500" />
            </div>
            <h2 className="text-[18px] font-bold text-[var(--soc-text-primary)] leading-relaxed mt-3">Suspend User?</h2>
            <p className="text-[13px] text-[var(--soc-text-muted)] leading-relaxed mt-1">
              Suspend <span className="font-semibold text-[var(--soc-text-primary)]">'{selectedUser.name}'</span> for 2 hours? They cannot sign in during this period.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => {
                  setShowSuspendModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-3 py-2.5 rounded-xl text-[12px] font-medium text-[var(--soc-text-secondary)] border border-[var(--soc-border)] hover:bg-[var(--soc-elevated)] transition-colors"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSuspend}
                className="flex-1 px-3 py-2.5 rounded-xl text-[12px] font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={actionLoading}
              >
                {actionLoading ? "Loading..." : "Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
