// Osembo: redeems a licence key.
//  - New school: key + email + password -> creates the admin login, links it to the school, sets the expiry date.
//  - Renewal: the school admin is logged in and sends only the key -> extends the expiry date.
// IMPORTANT: in Supabase, turn OFF "Enforce JWT verification" for this function (a new school has no login yet).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function normKey(raw: string): string {
  const k = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return k.length === 16 ? k.match(/.{4}/g)!.join("-") : raw.trim().toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const key = normKey(String(body.key ?? ""));
    if (!key) return json({ error: "Enter your licence key" }, 400);

    // Who is calling? (nobody, for a brand new school)
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    let user = null;
    if (token) {
      const { data } = await admin.auth.getUser(token);
      user = data?.user ?? null;
    }

    const bad = "This licence key is not valid or has already been used.";
    const { data: lic } = await admin.from("license_keys").select("*").eq("key", key).maybeSingle();
    if (!lic || lic.status !== "unused") return json({ error: bad }, 400);
    if (new Date(lic.valid_until) <= new Date()) return json({ error: "This licence key has already expired." }, 400);

    let uid: string;
    let email = "";
    let created = false;
    if (user) {
      const { data: m } = await admin.from("school_members").select("school_id,role").eq("user_id", user.id).maybeSingle();
      if (!m || m.role !== "admin") return json({ error: "Only the school admin can enter a licence key." }, 403);
      if (m.school_id !== lic.school_id) return json({ error: "This key belongs to a different school." }, 403);
      uid = user.id;
    } else {
      email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
      if (password.length < 8) return json({ error: "Password needs at least 8 characters." }, 400);
      const { count } = await admin.from("school_members").select("user_id", { count: "exact", head: true }).eq("school_id", lic.school_id);
      if ((count ?? 0) > 0) return json({ error: "This school is already activated. Log in and renew from Admin settings." }, 400);
      const { data: cu, error: ce } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (ce || !cu?.user) {
        return json({ error: /already|registered/i.test(ce?.message ?? "") ? "That email already has an account. Use a different email." : "Could not create the account: " + (ce?.message ?? "") }, 400);
      }
      uid = cu.user.id;
      created = true;
    }

    // Use the key exactly once, even if two requests arrive together
    const { data: claimed } = await admin.from("license_keys")
      .update({ status: "used", used_at: new Date().toISOString(), used_by: uid })
      .eq("key", key).eq("status", "unused").select("key");
    if (!claimed || claimed.length === 0) {
      if (created) await admin.auth.admin.deleteUser(uid);
      return json({ error: bad }, 400);
    }

    if (created) {
      const { error } = await admin.from("school_members").insert({ user_id: uid, school_id: lic.school_id, email, role: "admin" });
      if (error) {
        await admin.auth.admin.deleteUser(uid);
        await admin.from("license_keys").update({ status: "unused", used_at: null, used_by: null }).eq("key", key);
        return json({ error: "Could not finish activation. Try again." }, 500);
      }
    }

    // Access runs to the key's date, or the current end date if that is later
    const { data: sub } = await admin.from("subscriptions").select("paid_until").eq("school_id", lic.school_id).maybeSingle();
    const keyEnd = new Date(lic.valid_until);
    const cur = sub ? new Date(sub.paid_until) : new Date(0);
    const next = keyEnd > cur ? keyEnd : cur;
    await admin.from("subscriptions").upsert({
      school_id: lic.school_id, paid_until: next.toISOString(), ...(sub ? {} : { school_name: lic.school_name }),
    });

    return json({ ok: true, school_id: lic.school_id, paid_until: next.toISOString() });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
