import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Navbar from "../components/Navbar";
import {
  addNewUser,
  deleteUserAccount,
  fetchAllUsers,
  restoreUserAccount,
  suspendUserAccount,
} from "../services/userApi";
import { fetchNotifications } from "../services/notificationApi";

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [userStats, setUserStats] = useState({ total: 0, active: 0, pending: 0 });
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
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
    loadNotifications();
  }, []);

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

  const loadNotifications = async () => {
    try {
      setNotificationsLoading(true);
      const response = await fetchNotifications(1, 10);

      if (response.success) {
        setNotifications(response.notifications);
      }
    } catch (err) {
      setError("Failed to load notifications: " + (err.response?.data?.message || err.message));
    } finally {
      setNotificationsLoading(false);
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

  const formatNotificationTime = (timestamp) =>
    new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
        <div className="p-4 md:p-6 flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-6 shadow-lg flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <h1 className="text-4xl font-bold text-white mb-2">User Management</h1>
              <p className="text-slate-400">Manage user accounts and monitor admin login activity</p>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors w-full sm:w-fit"
            >
              <Plus className="h-4 w-4" />
              Add User
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 md:p-5 shadow-lg">
            <div className="flex flex-col gap-1 mb-4">
              <p className="text-sm font-semibold text-white">Account Overview</p>
              <p className="text-sm text-slate-400">A quick summary of current account status across the platform</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="relative overflow-hidden rounded-xl border border-sky-900/40 bg-sky-950/30 px-5 py-4">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-500/10 blur-2xl" />
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-300/70">Total Accounts</p>
                <p className="mt-3 text-3xl font-bold text-white">{userStats.total}</p>
                <p className="mt-2 text-sm text-slate-400">All registered users in the system</p>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-emerald-900/40 bg-emerald-950/25 px-5 py-4">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-400/10 blur-2xl" />
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300/70">Active Accounts</p>
                <p className="mt-3 text-3xl font-bold text-emerald-300">{userStats.active}</p>
                <p className="mt-2 text-sm text-slate-400">Users who currently have normal access</p>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-amber-900/40 bg-amber-950/25 px-5 py-4">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-400/10 blur-2xl" />
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300/70">Pending Accounts</p>
                <p className="mt-3 text-3xl font-bold text-amber-300">{userStats.pending}</p>
                <p className="mt-2 text-sm text-slate-400">Users who are temporarily restricted</p>
              </div>
            </div>
          </div>

          {successMessage && (
            <div className="p-4 bg-green-500/15 border border-green-500/30 rounded-xl text-green-300">
              <p className="font-medium">Success: {successMessage}</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/15 border border-red-500/30 rounded-xl text-red-300">
              <p className="font-medium">Error: {error}</p>
            </div>
          )}

          <div className="mb-12 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-cyan-500"></div>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-400">No users found</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-sky-950/45 border-b border-sky-900/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-slate-300 font-semibold">Name</th>
                      <th className="px-6 py-4 text-left text-slate-300 font-semibold">Email</th>
                      <th className="px-6 py-4 text-left text-slate-300 font-semibold">Status</th>
                      <th className="px-6 py-4 text-left text-slate-300 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {users.map((user) => {
                      const remainingTime = user.status === "pending" ? getRemainingTime(user.pendingUntil) : null;

                      return (
                        <tr key={user.id} className="hover:bg-slate-800/70 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-medium text-white">{user.name}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-300">{user.email}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {user.status === "active" ? (
                                <>
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  <span className="text-green-400 font-medium">Active</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="h-4 w-4 text-yellow-500" />
                                  <span className="text-yellow-400 font-medium">
                                    Pending
                                    {remainingTime && (
                                      <span className="text-xs text-yellow-300 ml-1">
                                        ({remainingTime.hours}h {remainingTime.minutes}m)
                                      </span>
                                    )}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {user.status === "active" ? (
                                <button
                                  onClick={() => handleSuspendUser(user)}
                                  className="p-2 hover:bg-yellow-500/20 text-yellow-400 rounded transition-colors"
                                  title="Suspend for 2 hours"
                                  disabled={actionLoading}
                                >
                                  <Clock className="h-4 w-4" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleRestoreUser(user)}
                                  className="p-2 hover:bg-green-500/20 text-green-400 rounded transition-colors"
                                  title="Restore from pending"
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
                                className="p-2 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                                title="Delete user"
                                disabled={actionLoading}
                              >
                                <Trash2 className="h-4 w-4" />
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
          </div>

          <div className="mb-12 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-300">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Admin Login Notifications</h2>
                  <p className="text-sm text-slate-400">Recent admin sign-in activity</p>
                </div>
              </div>
              <button
                onClick={loadNotifications}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700"
                disabled={notificationsLoading}
              >
                <RefreshCw className={`h-4 w-4 ${notificationsLoading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              {notificationsLoading ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-4 border-cyan-500 border-t-blue-500"></div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-6 py-12 text-center text-slate-400">No login notifications found</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-cyan-950/35 border-b border-cyan-900/40">
                    <tr>
                      <th className="px-6 py-4 text-left text-slate-300 font-semibold">ID Notifikasi</th>
                      <th className="px-6 py-4 text-left text-slate-300 font-semibold">Deskripsi</th>
                      <th className="px-6 py-4 text-left text-slate-300 font-semibold">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {notifications.map((notification) => (
                      <tr key={notification.id} className="hover:bg-slate-800/70 transition-colors">
                        <td className="px-6 py-4 text-cyan-300 font-mono text-sm">{notification.id_notifikasi}</td>
                        <td className="px-6 py-4 text-slate-200">{notification.deskripsi}</td>
                        <td className="px-6 py-4 text-slate-400 text-sm">{formatNotificationTime(notification.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-4">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-4 py-2 rounded ${
                    currentPage === page ? "bg-cyan-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-white"
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-2xl font-bold text-white mb-4">Add New User</h2>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="Enter name"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                  placeholder="Enter email"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
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
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <h2 className="text-2xl font-bold text-white">Delete User?</h2>
            </div>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete <span className="font-semibold">'{selectedUser.name}'</span>? This action
              cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
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
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-6 w-6 text-yellow-500" />
              <h2 className="text-2xl font-bold text-white">Suspend User?</h2>
            </div>
            <p className="text-slate-300 mb-6">
              Are you sure you want to suspend <span className="font-semibold">'{selectedUser.name}'</span> for 2 hours?
              The user will not be able to sign in during this period.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowSuspendModal(false);
                  setSelectedUser(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition-colors"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSuspend}
                className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded font-medium transition-colors"
                disabled={actionLoading}
              >
                {actionLoading ? "Loading..." : "Suspend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserManagement;
