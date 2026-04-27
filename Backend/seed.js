import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./models/user.model.js";
import bcrypt from "bcryptjs";
import connectDB from "./config/dbLogin.js";

// Load environment variables
dotenv.config();

const seedDatabase = async () => {
  try {
    console.log("🔄 Connecting to MongoDB...");
    await connectDB();
    console.log("✓ Connected to MongoDB");

    // Drop collection and recreate to remove old indexes
    console.log("🗑️  Dropping users collection...");
    try {
      await User.collection.drop();
      console.log("✓ Collection dropped successfully");
    } catch (error) {
      // Collection might not exist, that's fine
      console.log("ℹ️  Collection does not exist yet, creating new one");
    }

    // Delete all users (just in case)
    console.log("🗑️  Deleting all existing users...");
    const deleteResult = await User.deleteMany({});
    console.log(`✓ Deleted ${deleteResult.deletedCount} users`);

    // Create admin users
    console.log("👤 Creating admin users...");
    const adminPassword = await bcrypt.hash("password123", 10);
    const admins = [
      {
        name: "Admin Utama",
        email: "admin@capstone.com",
        password: adminPassword,
        role: "admin",
        status: "active",
      },
      {
        name: "Admin Test",
        email: "admin@test.com",
        password: adminPassword,
        role: "admin",
        status: "active",
      },
      {
        name: "Admin Wazuh",
        email: "admin@wazuh.com",
        password: adminPassword,
        role: "admin",
        status: "active",
      },
    ];

    const createdAdmins = [];
    for (const adminData of admins) {
      const admin = new User(adminData);
      await admin.save();
      createdAdmins.push(admin);
    }
    console.log(`✓ Created ${createdAdmins.length} admin users`);
    createdAdmins.forEach((admin, idx) => {
      console.log(`  ${idx + 1}. ${admin.name} (${admin.email}) - ID: ${admin._id} - user_id: ${admin.user_id}`);
    });

    // Create regular users
    console.log("\n👥 Creating regular users...");
    const userPassword = await bcrypt.hash("password123", 10);
    const users = [
      {
        name: "John Doe",
        email: "john@example.com",
        password: userPassword,
        role: "user",
        status: "active",
      },
      {
        name: "Jane Smith",
        email: "jane@example.com",
        password: userPassword,
        role: "user",
        status: "active",
      },
      {
        name: "Budi Santoso",
        email: "budi@example.com",
        password: userPassword,
        role: "user",
        status: "active",
      },
      {
        name: "Siti Nurhaliza",
        email: "siti@example.com",
        password: userPassword,
        role: "user",
        status: "active",
      },
    ];

    const createdUsers = [];
    for (const userData of users) {
      const user = new User(userData);
      await user.save();
      createdUsers.push(user);
    }
    console.log(`✓ Created ${createdUsers.length} regular users`);
    createdUsers.forEach((user, idx) => {
      console.log(`  ${idx + 1}. ${user.name} (${user.email}) - ID: ${user._id} - user_id: ${user.user_id}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("✓ DATABASE SEEDING COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));

    console.log("\n📋 TEST CREDENTIALS:\n");
    console.log("ADMIN ACCOUNTS:");
    console.log("  1. Email: admin@capstone.com | Password: password123");
    console.log("  2. Email: admin@test.com     | Password: password123");
    console.log("\nREGULAR USER ACCOUNTS (All use password: password123):");
    console.log("  1. Email: john@example.com  | Name: John Doe");
    console.log("  2. Email: jane@example.com  | Name: Jane Smith");
    console.log("  3. Email: budi@example.com  | Name: Budi Santoso");
    console.log("  4. Email: siti@example.com  | Name: Siti Nurhaliza");

    console.log("\n🚀 Total users created: " + (createdAdmins.length + createdUsers.length));
    console.log("   - Admins: " + createdAdmins.length);
    console.log("   - Regular Users: " + createdUsers.length);

    process.exit(0);
  } catch (error) {
    console.error("✗ Error during seeding:", error.message);
    console.error(error);
    process.exit(1);
  }
};

seedDatabase();
