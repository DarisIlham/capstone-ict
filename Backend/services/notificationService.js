import Notification from "../models/notification.model.js";

export const createAdminLoginNotification = async ({ name, email }) => {
  const displayName = name || email || "Admin";

  const notification = new Notification({
    deskripsi: `Admin login berhasil: ${displayName}${email ? ` (${email})` : ""}`,
  });

  const savedNotification = await notification.save();

  return {
    id: savedNotification._id,
    id_notifikasi: savedNotification.id_notifikasi,
    deskripsi: savedNotification.deskripsi,
    timestamp: savedNotification.timestamp,
  };
};

export const getNotifications = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [notifications, total] = await Promise.all([
    Notification.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(),
  ]);

  return {
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    },
    notifications: notifications.map((notification) => ({
      id: notification._id,
      id_notifikasi: notification.id_notifikasi,
      deskripsi: notification.deskripsi,
      timestamp: notification.timestamp,
    })),
  };
};
