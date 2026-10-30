// /api/admin 以下の共通の認証。ADMIN_TOKEN 未設定なら開発時のみ通す
export function adminAuthorized(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  return req.headers.get("x-admin-token") === token;
}
