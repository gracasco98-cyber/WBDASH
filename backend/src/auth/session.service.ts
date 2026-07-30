// session.service.ts — list and revoke PostgreSQL sessions (connect-pg-simple)
import { Pool } from "pg";

export interface SessionInfo {
  sid:        string;
  ip:         string | null;
  ua:         string | null;
  createdAt:  string | null;
  expiresAt:  Date;
  isCurrent:  boolean;
}

// ─── List sessions for a user ─────────────────────────────────────────────────

export async function listUserSessions(
  pool:       Pool,
  userId:     string,
  currentSid: string | null = null
): Promise<SessionInfo[]> {
  const { rows } = await pool.query<{
    sid: string;
    ip: string | null;
    ua: string | null;
    created_at: string | null;
    expire: Date;
  }>(
    `SELECT
       sid,
       sess->>'ip'        AS ip,
       sess->>'ua'        AS ua,
       sess->>'createdAt' AS created_at,
       expire
     FROM user_sessions
     WHERE sess->>'userId' = $1
       AND expire > NOW()
     ORDER BY expire DESC`,
    [userId]
  );

  return rows.map(r => ({
    sid:       r.sid,
    ip:        r.ip,
    ua:        r.ua,
    createdAt: r.created_at,
    expiresAt: r.expire,
    isCurrent: r.sid === currentSid,
  }));
}

// ─── Revoke a single session (ownership-checked) ─────────────────────────────

export async function revokeSession(
  pool:   Pool,
  sid:    string,
  userId: string
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_sessions
     WHERE sid = $1
       AND sess->>'userId' = $2`,
    [sid, userId]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Revoke all sessions except the current one ───────────────────────────────

export async function revokeAllOtherSessions(
  pool:       Pool,
  userId:     string,
  exceptSid:  string
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_sessions
     WHERE sess->>'userId' = $1
       AND sid != $2`,
    [userId, exceptSid]
  );
  return rowCount ?? 0;
}

// ─── Revoke ALL sessions (full logout) ───────────────────────────────────────

export async function revokeAllSessions(
  pool:   Pool,
  userId: string
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_sessions
     WHERE sess->>'userId' = $1`,
    [userId]
  );
  return rowCount ?? 0;
}
