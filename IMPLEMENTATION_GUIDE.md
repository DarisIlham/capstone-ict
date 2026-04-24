# Dokumentasi Implementasi Role User dan User Management

## 📋 Ringkasan Perubahan

### Backend Files yang Diubah/Dibuat:

#### 1. **models/user.model.js** (DIUBAH)
- Tambah field `role` (enum: ['admin', 'user'], default: 'user')
- Tambah field `status` (enum: ['active', 'pending'], default: 'active')
- Tambah field `pendingUntil` (Date, nullable)

#### 2. **controllers/auth.controller.js** (DIUBAH)
- Update `register()`: Include role dalam request & token, set default role = "admin"
- Update `login()`: 
  - Check pending status
  - Auto-update status ke active jika pending time sudah lewat
  - Return role & status dalam response

#### 3. **middleware/auth.middleware.js** (DIUBAH)
- Update `verifyToken()`: Include role dalam req.user
- Tambah `requireRole()`: Middleware untuk role checking

#### 4. **services/userService.js** (BARU)
- `addUser()`: Create user baru
- `deleteUser()`: Delete user
- `pendingUser()`: Set user ke status pending (default 2 jam)
- `unpendingUser()`: Batalkan pending status
- `getAllUsers()`: Get daftar user dengan pagination
- `getUserById()`: Get detail user
- `updateUserRole()`: Update role user

#### 5. **controllers/userController.js** (BARU)
- `createUser()`: Handle POST /api/users
- `getUsers()`: Handle GET /api/users
- `getUserDetail()`: Handle GET /api/users/:userId
- `removeUser()`: Handle DELETE /api/users/:userId
- `suspendUser()`: Handle POST /api/users/:userId/suspend
- `restoreUser()`: Handle POST /api/users/:userId/restore
- `changeUserRole()`: Handle PUT /api/users/:userId/role

#### 6. **routes/userRoutes.js** (BARU)
- Define semua endpoint untuk user management
- Apply middleware: verifyToken + requireRole("admin")

#### 7. **server.js** (DIUBAH)
- Tambah import userRouter
- Register userRouter di /api/users

### Frontend Files yang Diubah/Dibuat:

#### 1. **src/config/Api.js** (DIUBAH)
- Buat axios instance dengan interceptor
- Auto-include Authorization header dari token
- Handle 401 response

#### 2. **src/services/userApi.js** (BARU)
- `addNewUser()`: POST /api/users
- `fetchAllUsers()`: GET /api/users
- `fetchUserDetail()`: GET /api/users/:userId
- `deleteUserAccount()`: DELETE /api/users/:userId
- `suspendUserAccount()`: POST /api/users/:userId/suspend
- `restoreUserAccount()`: POST /api/users/:userId/restore
- `changeUserRole()`: PUT /api/users/:userId/role

#### 3. **src/components/Navbar.jsx** (DIUBAH)
- Show menu items berdasarkan role
- Tambah menu "User Management" untuk admin
- Display role & status badge

#### 4. **src/components/PrivateRoute.jsx** (DIUBAH)
- Tambah support requiredRole prop
- Check role validation
- Show access denied message

#### 5. **src/context/AuthContext.jsx** (NO CHANGE)
- Already works dengan role karena user object dari API include role

#### 6. **src/pages/UserManagement.jsx** (BARU)
- Admin dashboard untuk manage users
- Features:
  - List users dengan pagination
  - Add user (modal form)
  - Delete user (confirmation modal)
  - Suspend user (2 jam)
  - Restore user dari pending
  - Change user role

#### 7. **src/App.jsx** (DIUBAH)
- Tambah UserManagement import
- Tambah route /users dengan requiredRole="admin"

---

## 🔑 Fitur-Fitur Implementation

### 1. Dua Role: Admin & User
- **Admin**: Memiliki akses ke semua fitur + user management
- **User**: Akses terbatas, tidak bisa manage user lain

### 2. User Status Management
- **Active**: User bisa login
- **Pending**: User tidak bisa login selama 2 jam
  - `pendingUntil` field menyimpan deadline
  - Otomatis di-update ke active setelah 2 jam

### 3. Endpoint User Management (Admin Only)
- POST `/api/users` - Create user
- GET `/api/users` - List users (paginated)
- GET `/api/users/:userId` - Detail user
- DELETE `/api/users/:userId` - Delete user
- POST `/api/users/:userId/suspend` - Suspend 2 jam
- POST `/api/users/:userId/restore` - Restore dari pending
- PUT `/api/users/:userId/role` - Change role

### 4. Login Flow dengan Pending Check
```
1. User login dengan email & password
2. Backend check apakah user.status === "pending"
3. Jika pending dan masih berlaku: tolak login + tampilkan pesan
4. Jika pending sudah lewat: auto-update status ke active → allow login
5. Return token + user data (include role & status)
```

### 5. Default Behavior
- Ketika membuat user baru → default status "active", role "user"
- Ketika suspend user → status "pending", pendingUntil = now + 120 menit
- Ketika restore user → status "active", pendingUntil = null

---

## 📡 Request/Response Examples

### 1. REGISTER (Create Admin/User)
**Endpoint**: `POST /api/auth/register`

**Request**:
```json
{
  "name": "John Admin",
  "email": "admin@example.com",
  "password": "SecurePassword123!",
  "role": "admin",
  "captchaToken": "skip-captcha"
}
```

**Response (Success 201)**:
```json
{
  "success": true,
  "message": "Registrasi berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "admin@example.com",
    "name": "John Admin",
    "role": "admin",
    "status": "active"
  }
}
```

**Response (Error 409)**:
```json
{
  "success": false,
  "message": "Email sudah terdaftar"
}
```

---

### 2. LOGIN (Normal User)
**Endpoint**: `POST /api/auth/login`

**Request**:
```json
{
  "email": "user@example.com",
  "password": "UserPassword123!",
  "captchaToken": "skip-captcha"
}
```

**Response (Success 200)**:
```json
{
  "success": true,
  "message": "Login berhasil",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "email": "user@example.com",
    "name": "Jane User",
    "role": "user",
    "status": "active"
  }
}
```

**Response (Error - User Pending 401)**:
```json
{
  "success": false,
  "message": "Akun sedang dipending sampai 2024-01-15 14:30:00 (85 menit lagi)",
  "isPending": true,
  "pendingUntil": "2024-01-15T14:30:00.000Z"
}
```

**Response (Error - Wrong Password 401)**:
```json
{
  "success": false,
  "message": "Email atau password salah"
}
```

---

### 3. CREATE USER (Admin Only)
**Endpoint**: `POST /api/users`
**Auth**: Required, Role: admin

**Request**:
```json
{
  "name": "Budi Santoso",
  "email": "budi@example.com",
  "password": "BudiPassword123!",
  "role": "user"
}
```

**Request Header**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (Success 201)**:
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439013",
    "user_id": 2,
    "name": "Budi Santoso",
    "email": "budi@example.com",
    "role": "user",
    "status": "active",
    "created_at": "2024-01-15T09:00:00.000Z"
  }
}
```

**Response (Error 403 - Not Admin)**:
```json
{
  "success": false,
  "message": "Hanya admin yang dapat mengakses endpoint ini"
}
```

**Response (Error 409 - Email Exists)**:
```json
{
  "success": false,
  "message": "Email sudah terdaftar"
}
```

---

### 4. GET ALL USERS (Admin Only)
**Endpoint**: `GET /api/users?page=1&limit=10`
**Auth**: Required, Role: admin

**Request Header**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (Success 200)**:
```json
{
  "success": true,
  "pagination": {
    "total": 3,
    "page": 1,
    "limit": 10,
    "pages": 1
  },
  "users": [
    {
      "id": "507f1f77bcf86cd799439011",
      "user_id": 1,
      "name": "John Admin",
      "email": "admin@example.com",
      "role": "admin",
      "status": "active",
      "pendingUntil": null,
      "created_at": "2024-01-15T08:00:00.000Z",
      "updated_at": "2024-01-15T08:00:00.000Z"
    },
    {
      "id": "507f1f77bcf86cd799439012",
      "user_id": 2,
      "name": "Jane User",
      "email": "user@example.com",
      "role": "user",
      "status": "active",
      "pendingUntil": null,
      "created_at": "2024-01-15T09:00:00.000Z",
      "updated_at": "2024-01-15T09:00:00.000Z"
    },
    {
      "id": "507f1f77bcf86cd799439013",
      "user_id": 3,
      "name": "Budi Santoso",
      "email": "budi@example.com",
      "role": "user",
      "status": "pending",
      "pendingUntil": "2024-01-15T14:30:00.000Z",
      "created_at": "2024-01-15T10:00:00.000Z",
      "updated_at": "2024-01-15T12:30:00.000Z"
    }
  ]
}
```

---

### 5. GET USER DETAIL (Admin Only)
**Endpoint**: `GET /api/users/507f1f77bcf86cd799439012`
**Auth**: Required, Role: admin

**Response (Success 200)**:
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "user_id": 2,
    "name": "Jane User",
    "email": "user@example.com",
    "role": "user",
    "status": "active",
    "pendingUntil": null,
    "created_at": "2024-01-15T09:00:00.000Z",
    "updated_at": "2024-01-15T09:00:00.000Z"
  }
}
```

**Response (Error 404 - Not Found)**:
```json
{
  "success": false,
  "message": "User tidak ditemukan"
}
```

---

### 6. SUSPEND USER (Admin Only - Pending 2 Jam)
**Endpoint**: `POST /api/users/507f1f77bcf86cd799439012/suspend`
**Auth**: Required, Role: admin

**Request Body**:
```json
{
  "durationMinutes": 120
}
```

**Response (Success 200)**:
```json
{
  "success": true,
  "message": "User 'Jane User' berhasil dipending selama 120 menit",
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "name": "Jane User",
    "email": "user@example.com",
    "status": "pending",
    "pendingUntil": "2024-01-15T14:00:00.000Z"
  }
}
```

---

### 7. RESTORE USER (Admin Only - Cancel Pending)
**Endpoint**: `POST /api/users/507f1f77bcf86cd799439012/restore`
**Auth**: Required, Role: admin

**Response (Success 200)**:
```json
{
  "success": true,
  "message": "User 'Jane User' dipulihkan dari pending",
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "name": "Jane User",
    "email": "user@example.com",
    "status": "active"
  }
}
```

---

### 8. DELETE USER (Admin Only)
**Endpoint**: `DELETE /api/users/507f1f77bcf86cd799439013`
**Auth**: Required, Role: admin

**Response (Success 200)**:
```json
{
  "success": true,
  "message": "User 'Budi Santoso' berhasil dihapus"
}
```

**Response (Error 404)**:
```json
{
  "success": false,
  "message": "User tidak ditemukan"
}
```

---

### 9. CHANGE USER ROLE (Admin Only)
**Endpoint**: `PUT /api/users/507f1f77bcf86cd799439012/role`
**Auth**: Required, Role: admin

**Request Body**:
```json
{
  "role": "admin"
}
```

**Response (Success 200)**:
```json
{
  "success": true,
  "message": "Role user 'Jane User' diubah menjadi 'admin'",
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "name": "Jane User",
    "email": "user@example.com",
    "role": "admin"
  }
}
```

---

## 🔐 Error Responses (Umum)

### 401 - Unauthorized (No Token)
```json
{
  "message": "No token, authorization denied"
}
```

### 401 - Invalid Token
```json
{
  "message": "Invalid token"
}
```

### 403 - Access Denied (Wrong Role)
```json
{
  "success": false,
  "message": "Hanya admin yang dapat mengakses endpoint ini"
}
```

### 500 - Server Error
```json
{
  "success": false,
  "message": "Server error atau error message dari exception"
}
```

---

## 🚀 Testing dengan cURL atau Postman

### Register Admin:
```bash
curl -X POST http://127.0.0.1:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin Baru",
    "email": "admin@test.com",
    "password": "Admin123!",
    "role": "admin",
    "captchaToken": "skip-captcha"
  }'
```

### Login:
```bash
curl -X POST http://127.0.0.1:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Admin123!",
    "captchaToken": "skip-captcha"
  }'
```
Copy token dari response.

### Create User (gunakan token dari login):
```bash
curl -X POST http://127.0.0.1:5000/api/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "User Baru",
    "email": "user@test.com",
    "password": "User123!",
    "role": "user"
  }'
```

### Get All Users:
```bash
curl -X GET "http://127.0.0.1:5000/api/users?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Suspend User (replace USER_ID):
```bash
curl -X POST http://127.0.0.1:5000/api/users/USER_ID/suspend \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "durationMinutes": 120
  }'
```

---

## ✅ Checklist Implementation

- [x] Update User Model (role, status, pendingUntil)
- [x] Update Auth Controller (login dengan pending check, register dengan role)
- [x] Update Auth Middleware (requireRole middleware)
- [x] Create User Service (semua business logic)
- [x] Create User Controller (semua endpoints logic)
- [x] Create User Routes (register semua endpoints)
- [x] Update Server.js (attach user routes)
- [x] Create userApi.js frontend (API client)
- [x] Update Navbar (role-based menu, status badge)
- [x] Update PrivateRoute (requiredRole prop)
- [x] Create UserManagement.jsx (admin UI)
- [x] Update App.jsx (add route)
- [x] Update Api.js (axios interceptor)

---

## 🔄 Auto-Update Pending Status

Ketika user dengan status pending mencoba login:
1. Backend check: `now < pendingUntil`?
2. Jika TRUE: Reject login + return error message dengan remaining time
3. Jika FALSE (waktu sudah lewat):
   - Update user.status = "active"
   - Update user.pendingUntil = null
   - Save ke database
   - ALLOW LOGIN

Ini memastikan user bisa login otomatis tanpa admin action.

---

## 📝 Notes

- Password selalu di-hash menggunakan bcryptjs sebelum disimpan
- JWT token include role untuk cepat check di frontend
- Frontend API interceptor otomatis include token & handle 401
- Role checking dilakukan di backend + frontend untuk user experience lebih baik
- Pagination default 10 items per page
- Admin bisa change role user, termasuk promote user jadi admin
