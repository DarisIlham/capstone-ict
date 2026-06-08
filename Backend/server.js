import 'dotenv/config';
import app from "./app.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/userRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";
import { initializeWebDefacementEndpointStore } from "./services/webDefacementEndpointService.js";
import { initDB } from "./db.js";
import { handleEventsRequest, handleDomainSummaryRequest } from "./controllers/eventsController.js";
import { handleHuntingRequest } from "./controllers/huntingController.js";
import { startAutoPull } from "./autoPull.js";
import { notFoundHandler, globalErrorHandler } from "./errorHandlers.js";

console.log('DEBUG: DB_PASS typeof', typeof process.env.DB_PASS, 'present=', !!process.env.DB_PASS);

// initialize subsystems
initDB();

initializeWebDefacementEndpointStore()
  .then(() => console.log("Web defacement endpoint store ready"))
  .catch((error) => console.error("Failed to initialize web defacement endpoint store:", error.message));

// Register routers
app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/notifications", notificationRouter);

// Events and hunting endpoints (moved to controllers)
app.get("/api/events", handleEventsRequest);
app.get("/api/events/:agent_id", handleEventsRequest);
app.get("/api/fim/domains", handleDomainSummaryRequest);
app.get("/api/fim/:agent_id/domains", handleDomainSummaryRequest);
app.get("/api/hunting", handleHuntingRequest);

const PORT = process.env.PORT || 5000;

// Start auto pull (returns a cleanup function)
startAutoPull(PORT);

// Error handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server berjalan di port: ${PORT}`);
  console.log(`📡 Frontend can access at http://localhost:${PORT}`);
});
