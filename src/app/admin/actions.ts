"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminCookieOptions, adminCookieValue, checkAdminToken } from "@/lib/admin";

/** Exchanges ADMIN_TOKEN for the admin cookie (the token itself is never stored). */
export async function adminLogin(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const value = adminCookieValue();
  if (!checkAdminToken(token) || !value) redirect("/admin/login?error=1");
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, value, adminCookieOptions());
  redirect("/admin");
}

export async function adminLogout() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/");
}
