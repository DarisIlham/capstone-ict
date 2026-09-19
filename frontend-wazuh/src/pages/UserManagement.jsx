import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Users,
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
  <div className={`kpi-modern animate-fadeInUp stagger-${index + 1}`} style={{ opacity: 0 }}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-[9px] font-semibold text-[var(--soc-text-muted)] uppercase tracking-wider">{label}</span>
      <div className={`p-2 rounded-lg ${color} bg-opacity-10`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
    </div>
    <div className={`text-xl font-bold ${color} mb-1`}>
      {loading ? <div className="skeleton h-6 w-16"></div> : value}
    </div>
    <div className="text-[9px] text-[var(--soc-text-muted)]">{desc}</div>
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
    <div className="flex flex-col gap-4 w-full min-w-0">
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg min-[600px]:text-xl font-bold text-[var(--soc-text-primary)]">
            User Management
          </h1>
          <p className="text-[11px] text-[var(--soc-text-muted)] mt-0.5">
            Manage user accounts and monitor admin login activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors w-full sm:w-fit"
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

      <div className="grid grid-cols-2 min-[700px]:grid-cols-3 gap-3">
        <KPICard label="Total Accounts" value={new Intl.NumberFormat("en-US").format(userStats.total)} icon={Users} color="text-sky-400" desc="all registered users" loading={loading} index={0} />
        <KPICard label="Active Accounts" value={new Intl.NumberFormat("en-US").format(userStats.active)} icon={CheckCircle} color="text-emerald-400" desc="users with normal access" loading={loading} index={1} />
        <KPICard label="Pending Accounts" value={new Intl.NumberFormat("en-US").format(userStats.pending)} icon={Clock} color="text-amber-400" desc="users temporarily restricted" loading={loading} index={2} />
      </div>

      <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg md:rounded-xl shadow-lg h-auto overflow-hidden animate-fadeInUp stagger-4" style={{ opacity: 0 }}>
        <div className="px-3 py-2.5 md:px-4 md:py-3 border-b border-[var(--soc-border)] bg-[var(--soc-card)]">
          <div className="text-[11px] md:text-xs font-semibold text-slate-300">
            Account Overview
          </div>
        </div>
        <div className="overflow-x-auto">
              {loading ? (
                <PageLoader message="Loading users..." size="sm" />
              ) : users.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <p className="text-sm text-slate-400 font-medium">No users found</p>
                </div>
              ) : (
                <table className="w-full min-w-[720px] text-[10px] md:text-[11px] text-left">
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
              )}
              </div>

              {totalPages > 1 && (
                <div className="border-t border-slate-800 bg-slate-900/50 px-2 md:px-4 py-3">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-0">
                    <div className="text-[10px] md:text-[11px] font-mono text-slate-500">
                      <span className="font-bold text-sky-400">PAGE </span>
                      <span className="font-bold text-white">{currentPage}</span> / {totalPages}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-5 max-w-md w-full">
            <h2 className="text-base md:text-lg font-bold text-white mb-4">Add New User</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-[11px] text-slate-300 font-medium mb-1.5">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[var(--soc-card)] border border-[var(--soc-border)] rounded px-3 py-2 text-xs text-[var(--soc-text-primary)] placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                  placeholder="Enter name"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-[var(--soc-card)] border border-[var(--soc-border)] rounded px-3 py-2 text-xs text-[var(--soc-text-primary)] placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                  placeholder="Enter email"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-300 font-medium mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-[var(--soc-card)] border border-[var(--soc-border)] rounded px-3 py-2 text-xs text-[var(--soc-text-primary)] placeholder-slate-600 focus:outline-none focus:border-sky-500/50"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2 text-slate-400 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-[var(--soc-border)] text-white rounded text-xs font-medium transition-colors"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-medium transition-colors"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-5 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <h2 className="text-base md:text-lg font-bold text-white">Delete User?</h2>
            </div>
            <p className="text-xs text-slate-300 mb-6">
              Are you sure you want to delete <span className="font-semibold">'{selectedUser.name}'</span>? This action
              cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-[var(--soc-border)] text-white rounded text-xs font-medium transition-colors"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium transition-colors"
                disabled={actionLoading}
              >
                {actionLoading ? "Loading..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuspendModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--soc-card)] border border-[var(--soc-border)] rounded-lg p-5 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-5 w-5 text-yellow-400" />
              <h2 className="text-base md:text-lg font-bold text-white">Suspend User?</h2>
            </div>
            <p className="text-xs text-slate-300 mb-6">
              Are you sure you want to suspend <span className="font-semibold">'{selectedUser.name}'</span> for 2 hours?
              The user will not be able to sign in during this period.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSuspendModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-[var(--soc-border)] text-white rounded text-xs font-medium transition-colors"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSuspend}
                className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs font-medium transition-colors"
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
