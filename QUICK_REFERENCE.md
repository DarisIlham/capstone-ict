# 🔍 Quick Reference - Key Implementation Details

## 1️⃣ Database Model Update

### User Schema Fields
```javascript
// models/user.model.js
{
  user_id: Number,              // Auto-increment
  name: String,                 // Required
  email: String,                // Required, unique
  password: String,             // Required, hashed
  
  // NEW FIELDS:
  role: String,                 // "admin" or "user" (default: "user")
  status: String,               // "active" or "pending" (default: "active")
  pendingUntil: Date,           // Nullable, deadline untuk pending status
  
  created_at: Date,
  updated_at: Date
}
```

---

## 2️⃣ Login Pending Status Check Logic

### Flow Diagram
```
User Login
    ↓
[Check credentials]
    ✓
[Check status = "pending"?]
    ├─ YES → [now < pendingUntil?]
    │         ├─ YES → ❌ Reject login (remaining time)
    │         └─ NO → 🔄 Auto-update to active → ✅ Allow login
    └─ NO → ✅ Allow login
```

### Backend Code (login function)
```javascript
// Check pending status
if (user.status === "pending" && user.pendingUntil) {
  const now = new Date();
  const pendingUntil = new Date(user.pendingUntil);

  if (now < pendingUntil) {
    // Still pending
    const remainingTime = Math.ceil((pendingUntil - now) / 1000 / 60);
    return res.status(403).json({
      success: false,
      message: `Akun sedang dipending sampai ${pendingUntil.toLocaleString()} 
                (${remainingTime} menit lagi)`,
      isPending: true,
      pendingUntil: pendingUntil.toISOString(),
    });
  } else {
    // Pending time has passed, auto-update
    user.status = "active";
    user.pendingUntil = null;
    await user.save();
  }
}
```

---

## 3️⃣ Role-Based Middleware

### Using requireRole Middleware
```javascript
// routes/userRoutes.js
router.use(verifyToken);           // Check authentication
router.use(requireRole("admin"));  // Check role = admin

// All routes below here require admin role
router.post("/", createUser);
router.get("/", getUsers);
```

### Middleware Implementation
```javascript
// middleware/auth.middleware.js
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Hanya ${roles.join(", ")} yang dapat mengakses endpoint ini`,
      });
    }

    next();
  };
};
```

---

## 4️⃣ Suspend User (Pending 2 Jam)

### Service Layer
```javascript
// services/userService.js
export const pendingUser = async (userId, durationMinutes = 120) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User tidak ditemukan");

  const now = new Date();
  const pendingUntil = new Date(now.getTime() + durationMinutes * 60000);

  user.status = "pending";
  user.pendingUntil = pendingUntil;
  await user.save();

  return {
    success: true,
    message: `User dipending selama ${durationMinutes} menit`,
    user: {
      id: user._id,
      name: user.name,
      status: user.status,
      pendingUntil: user.pendingUntil,
    },
  };
};
```

### Controller
```javascript
// controllers/userController.js
export const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { durationMinutes = 120 } = req.body;

    const result = await pendingUser(userId, durationMinutes);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
```

### Route
```javascript
// routes/userRoutes.js
router.post("/:userId/suspend", suspendUser);
```

---

## 5️⃣ Frontend API Client with Interceptor

### Axios Setup
```javascript
// src/config/Api.js
import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:5000",
  headers: { "Content-Type": "application/json" },
});

// Request interceptor - include token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default API;
```

### Usage
```javascript
// Any API call automatically includes token:
const response = await API.post("/users", userData);
// Headers: Authorization: Bearer token
```

---

## 6️⃣ Frontend Role-Based Routing

### PrivateRoute Component
```javascript
// src/components/PrivateRoute.jsx
const PrivateRoute = ({ children, requiredRole = null }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check role if specified
  if (requiredRole && user?.role !== requiredRole) {
    return (
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-red-500 mb-4">Access Denied</h1>
        <p className="text-slate-300">
          Role yang diperlukan: <span className="text-cyan-400">{requiredRole}</span>
        </p>
      </div>
    );
  }

  return children;
};
```

### Route Protection
```javascript
// src/App.jsx
<Route
  path="/users"
  element={
    <PrivateRoute requiredRole="admin">
      <UserManagement />
    </PrivateRoute>
  }
/>
```

---

## 7️⃣ User Management UI Features

### List Users with Pending Timer
```javascript
// src/pages/UserManagement.jsx
const getRemainingTime = (pendingUntil) => {
  const now = new Date();
  const pending = new Date(pendingUntil);
  const diff = pending - now;

  if (diff <= 0) return null;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return { hours, minutes };
};

// Display in table
{user.status === "pending" ? (
  <>
    <Clock className="h-4 w-4 text-yellow-500" />
    <span className="text-yellow-400">
      Pending
      {remainingTime && (
        <span className="text-xs text-yellow-300 ml-1">
          ({remainingTime.hours}h {remainingTime.minutes}m)
        </span>
      )}
    </span>
  </>
) : (
  <>
    <CheckCircle className="h-4 w-4 text-green-500" />
    <span className="text-green-400">Active</span>
  </>
)}
```

### Suspend Action
```javascript
const handleSuspendUser = async (user) => {
  setActionLoading(true);
  try {
    const response = await suspendUserAccount(user.id, 120);
    if (response.success) {
      setSuccessMessage(response.message);
      setTimeout(() => loadUsers(), 500);
    }
  } catch (err) {
    setError("Gagal mem-pending user: " + err.response?.data?.message);
  } finally {
    setActionLoading(false);
  }
};
```

---

## 8️⃣ JWT Token Include Role

### During Login/Register
```javascript
// controllers/auth.controller.js
const token = jwt.sign(
  {
    userId: user._id,
    email: user.email,
    role: user.role,        // ← Include role in token
  },
  process.env.JWT_SECRET || "your-secret-key",
  { expiresIn: "7d" }
);
```

### Frontend User Object
```javascript
// After login, user object includes:
{
  id: "507f...",
  email: "user@example.com",
  name: "John Doe",
  role: "admin",              // ← Available in UI
  status: "active"            // ← For checking pending status
}
```

---

## 9️⃣ Navbar Role-Based Menu

### Menu Items by Role
```javascript
// src/components/Navbar.jsx
const baseMenuItems = [
  { label: "Main Dashboard", href: "/" },
  { label: "ML Dashboard", href: "/ml-dashboard" },
  // ... other common items
];

const adminMenuItems = [
  { label: "User Management", href: "/users", icon: Users },
];

const menuItems = 
  user?.role === "admin" 
    ? [...baseMenuItems, ...adminMenuItems] 
    : baseMenuItems;
```

### Role Badge Display
```javascript
<span className={`
  text-xs px-2 py-0.5 rounded-full font-semibold
  ${user?.role === "admin" 
    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" 
    : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
  }
`}>
  {user?.role === "admin" ? "Administrator" : "User"}
</span>
```

---

## 🔟 Error Handling Examples

### Pending Login Error
```javascript
// Response: 403
{
  "success": false,
  "message": "Akun sedang dipending sampai 2024-01-15 14:30:00 (85 menit lagi)",
  "isPending": true,
  "pendingUntil": "2024-01-15T14:30:00.000Z"
}

// Frontend handling:
if (error.response?.data?.isPending) {
  // Show special pending message
  showPendingMessage(error.response.data.message);
}
```

### Access Denied Error
```javascript
// Response: 403
{
  "success": false,
  "message": "Hanya admin yang dapat mengakses endpoint ini"
}

// Automatically handled by PrivateRoute
```

### Token Expired Error
```javascript
// Response: 401
// Automatically cleared by interceptor
// User redirected to login
// Local storage cleared
```

---

## 📊 Data Flow Example

### Create User Flow
```
User (Admin) 
    ↓
[Fill form in UserManagement page]
    ↓
[Click "Tambah User"]
    ↓
Frontend: userApi.addNewUser(data)
    ↓
POST /api/users with Authorization header
    ↓
Backend: verifyToken middleware
    ↓
Backend: requireRole("admin") middleware
    ↓
Backend: userController.createUser()
    ↓
Backend: userService.addUser()
    ↓
[Hash password + Save to MongoDB]
    ↓
Return success with new user data
    ↓
Frontend: Show success message
    ↓
Frontend: Reload users list
    ↓
[New user appears in table]
```

---

## 🎯 Quick Troubleshooting

### Issue: Frontend can't connect to backend
**Solution**: Check API_BASE_URL in `src/config/Api.js` matches backend port

### Issue: Token not being sent
**Solution**: Check localStorage has `token` key via browser dev tools

### Issue: Access Denied on /users route
**Solution**: Make sure user is logged in as admin (user.role === "admin")

### Issue: Pending time not updating
**Solution**: Check browser is showing real-time from `getRemainingTime()` function

### Issue: Auto-update pending not working
**Solution**: Make sure backend logic checks `now < pendingUntil` correctly

---

## 📚 Reference Links

- User Model: [Backend/models/user.model.js](../Backend/models/user.model.js)
- Auth Controller: [Backend/controllers/auth.controller.js](../Backend/controllers/auth.controller.js)
- User Routes: [Backend/routes/userRoutes.js](../Backend/routes/userRoutes.js)
- UserManagement Page: [frontend-wazuh/src/pages/UserManagement.jsx](../frontend-wazuh/src/pages/UserManagement.jsx)
- API Client: [frontend-wazuh/src/config/Api.js](../frontend-wazuh/src/config/Api.js)

---

**Last Updated**: 2024
