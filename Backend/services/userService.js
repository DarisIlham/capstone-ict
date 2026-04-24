import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

/**
 * Tambah user baru (hanya admin)
 */
export const addUser = async (name, email, password, role = "user") => {
  try {
    // Validasi input
    if (!name || !email || !password) {
      throw new Error("Nama, email, dan password harus diisi");
    }

    // Validasi role
    if (!["admin", "user"].includes(role)) {
      throw new Error("Role harus 'admin' atau 'user'");
    }

    // Cek apakah email sudah ada
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("Email sudah terdaftar");
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user baru
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role,
      status: "active",
    });

    const savedUser = await newUser.save();

    return {
      success: true,
      user: {
        id: savedUser._id,
        user_id: savedUser.user_id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role,
        status: savedUser.status,
        created_at: savedUser.created_at,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Hapus user berdasarkan id
 */
export const deleteUser = async (userId) => {
  try {
    if (!userId) {
      throw new Error("User ID harus diisi");
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      throw new Error("User tidak ditemukan");
    }

    return {
      success: true,
      message: `User '${user.name}' berhasil dihapus`,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Set user ke status pending selama 2 jam
 */
export const pendingUser = async (userId, durationMinutes = 120) => {
  try {
    if (!userId) {
      throw new Error("User ID harus diisi");
    }

    // Validasi duration
    if (typeof durationMinutes !== "number" || durationMinutes <= 0) {
      throw new Error("Duration harus bilangan positif (dalam menit)");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User tidak ditemukan");
    }

    // Set pending status
    const now = new Date();
    const pendingUntil = new Date(now.getTime() + durationMinutes * 60000);

    user.status = "pending";
    user.pendingUntil = pendingUntil;
    await user.save();

    return {
      success: true,
      message: `User '${user.name}' berhasil dipending selama ${durationMinutes} menit`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
        pendingUntil: user.pendingUntil,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Batalkan pending status user
 */
export const unpendingUser = async (userId) => {
  try {
    if (!userId) {
      throw new Error("User ID harus diisi");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User tidak ditemukan");
    }

    user.status = "active";
    user.pendingUntil = null;
    await user.save();

    return {
      success: true,
      message: `User '${user.name}' dipulihkan dari pending`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Ambil semua user (untuk admin)
 */
export const getAllUsers = async (page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;

    const users = await User.find()
      .select("-password") // Jangan include password
      .skip(skip)
      .limit(limit)
      .sort({ created_at: -1 });

    const total = await User.countDocuments();

    return {
      success: true,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      users: users.map((user) => ({
        id: user._id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        pendingUntil: user.pendingUntil,
        created_at: user.created_at,
        updated_at: user.updated_at,
      })),
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Ambil user berdasarkan id
 */
export const getUserById = async (userId) => {
  try {
    const user = await User.findById(userId).select("-password");
    if (!user) {
      throw new Error("User tidak ditemukan");
    }

    return {
      success: true,
      user: {
        id: user._id,
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        pendingUntil: user.pendingUntil,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

/**
 * Update role user
 */
export const updateUserRole = async (userId, newRole) => {
  try {
    if (!userId) {
      throw new Error("User ID harus diisi");
    }

    if (!["admin", "user"].includes(newRole)) {
      throw new Error("Role harus 'admin' atau 'user'");
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User tidak ditemukan");
    }

    user.role = newRole;
    await user.save();

    return {
      success: true,
      message: `Role user '${user.name}' diubah menjadi '${newRole}'`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  } catch (error) {
    throw new Error(error.message);
  }
};
