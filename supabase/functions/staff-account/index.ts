// Osembo: lets a school admin create a teacher's login (so you never have to do it in the Supabase dashboard).
// Leave "Enforce JWT verification" ON for this function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const env = (k: string) => Deno.env.get(k) ?? "";
    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Please log in again" }, 401);

    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: m } = await admin.from("school_members").select("school_id,role").eq("user_id", user.id).maybeSingle();
    if (!m || m.role !== "admin") return json({ error: "Only the school admin can create logins" }, 403);
    const { data: sub } = await admin.from("subscriptions").select("paid_until,suspended").eq("school_id", m.school_id).maybeSingle();
    if (!sub || sub.suspended || new Date(sub.paid_until) <= new Date()) return json({ error: "Renew the subscription first" }, 403);

    const { email: rawEmail, password } = await req.json();
    const email = String(rawEmail ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
    if (String(password ?? "").length < 8) return json({ error: "Password needs at least 8 characters" }, 400);

    const { data: cu, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (ce || !cu?.user) {
      return json({ error: /already|registered/i.test(ce?.message ?? "") ? "That email already has a login" : "Could not create the login: " + (ce?.message ?? "") }, 400);
    }
    const { error } = await admin.from("school_members").insert({ user_id: cu.user.id, school_id: m.school_id, email, role: "staff" });
    if (error) {
      await admin.auth.admin.deleteUser(cu.user.id);
      return json({ error: "Could not link the login to the school" }, 500);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
