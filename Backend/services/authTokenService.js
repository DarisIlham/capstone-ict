import jwt from "jsonwebtoken";
import pool from "../config/pg.js";
import { JWT_SECRET } from "../config/security.js";

export function createAuthTokenService(database = pool, secret = JWT_SECRET) {
  async function issueLoginToken(userId, rememberMe) {
    const client = await database.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;
      const result = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [userId]);
      const row = result.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return { error: { status: 404, message: "User tidak ditemukan" } };
      }
      if ((row.status || "active") !== "active") {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return {
          row,
          error: { status: 403, message: "Account is not active" },
        };
      }

      const token = jwt.sign(
        { userId: row.id, email: row.email, role: row.role || "user", loginAt: Date.now() },
        secret,
        { expiresIn: rememberMe ? "7d" : "12h" }
      );
      await client.query("COMMIT");
      transactionStarted = false;
      return { row, token };
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original transaction error.
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  return { issueLoginToken };
}

const authTokenService = createAuthTokenService();
export const issueLoginToken = authTokenService.issueLoginToken;