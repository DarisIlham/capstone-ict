import asyncHandler from "../utils/asyncHandler.js";
import { getNotifications } from "../services/notificationService.js";

export const listNotifications = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

  const result = await getNotifications(page, limit);

  res.json({
    success: true,
    ...result,
  });
});
