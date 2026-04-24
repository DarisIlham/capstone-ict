import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    id_notifikasi: {
      type: Number,
      unique: true,
    },
    deskripsi: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

notificationSchema.pre("save", async function (next) {
  if (this.isNew && !this.id_notifikasi) {
    const lastNotification = await this.constructor.findOne().sort({ id_notifikasi: -1 });
    this.id_notifikasi = lastNotification ? lastNotification.id_notifikasi + 1 : 1;
  }

  if (!this.timestamp) {
    this.timestamp = Date.now();
  }

  next();
});

const Notification = mongoose.model("Notifikasi", notificationSchema, "notifikasi");

export default Notification;
