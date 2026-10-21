// Osembo: sends an M-Pesa payment prompt (Lipa na M-Pesa Buy Goods) to the admin's phone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function nairobiTimestamp(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return get("year") + get("month") + get("day") + get("hour") + get("minute") + get("second");
}

function toMsisdn(phone: string): string | null {
  const p = phone.replace(/\s/g, "");
  if (/^0[17]\d{8}$/.test(p)) return "254" + p.slice(1);
  if (/^254[17]\d{8}$/.test(p)) return p;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const env = (k: string) => Deno.env.get(k) ?? "";

    // 1. Only the school admin (ADMIN_EMAIL secret) may start a payment
    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user || (user.email ?? "").toLowerCase() !== env("ADMIN_EMAIL").toLowerCase()) {
      return json({ error: "Only the school admin can renew the subscription" }, 403);
    }

    // 2. Check the phone number and work out the amount
    const { phone, months } = await req.json();
    const msisdn = toMsisdn(String(phone ?? ""));
    if (!msisdn) return json({ error: "Enter a valid phone number, e.g. 0712345678" }, 400);
    const m = Math.min(Math.max(parseInt(months) || 1, 1), 12);
    const amount = Number(env("SUBSCRIPTION_PRICE")) * m;
    if (!amount || amount <= 0) return json({ error: "SUBSCRIPTION_PRICE secret is not set" }, 500);

    // 3. Get an M-Pesa access token
    const base = env("MPESA_ENV") === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
    const tokenRes = await fetch(base + "/oauth/v1/generate?grant_type=client_credentials", {
      headers: { Authorization: "Basic " + btoa(env("MPESA_CONSUMER_KEY") + ":" + env("MPESA_CONSUMER_SECRET")) },
    });
    if (!tokenRes.ok) return json({ error: "M-Pesa login failed. Check the M-Pesa secrets." }, 502);
    const { access_token } = await tokenRes.json();

    // 4. Send the payment prompt
    const shortcode = env("MPESA_TILL");
    const ts = nairobiTimestamp();
    const password = btoa(shortcode + env("MPESA_PASSKEY") + ts);
    const stkRes = await fetch(base + "/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: "Bearer " + access_token, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: "CustomerBuyGoodsOnline",
        Amount: amount,
        PartyA: msisdn,
        PartyB: shortcode,
        PhoneNumber: msisdn,
        CallBackURL: env("SUPABASE_URL") + "/functions/v1/mpesa-callback",
        AccountReference: "Osembo",
        TransactionDesc: "Osembo subscription",
      }),
    });
    const stk = await stkRes.json();
    if (!stkRes.ok || stk.ResponseCode !== "0") {
      return json({ error: stk.errorMessage || stk.ResponseDescription || "M-Pesa request failed" }, 502);
    }

    // 5. Remember the pending payment so the callback can match it
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { error } = await admin.from("mpesa_payments").insert({
      school_id: "osembo-main", phone: msisdn, amount, months: m,
      checkout_request_id: stk.CheckoutRequestID, status: "pending",
    });
    if (error) return json({ error: "Could not record the payment: " + error.message }, 500);

    return json({ ok: true, message: stk.CustomerMessage });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
