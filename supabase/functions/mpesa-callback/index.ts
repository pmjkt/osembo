// Osembo: receives M-Pesa's result and extends the school's subscription when paid.
// IMPORTANT: in Supabase, turn OFF "Enforce JWT verification" for this function,
// because M-Pesa cannot send a Supabase login token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ok = () =>
  new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  try {
    // Only accept calls that carry our secret (set MPESA_CALLBACK_TOKEN; it is added to the callback address)
    const want = Deno.env.get("MPESA_CALLBACK_TOKEN") ?? "";
    if (want && new URL(req.url).searchParams.get("t") !== want) return ok();
    const body = await req.json();
    const cb = body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return ok();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only act on payments we started and have not finished yet
    const { data: pay } = await admin.from("mpesa_payments").select("*")
      .eq("checkout_request_id", cb.CheckoutRequestID).eq("status", "pending").maybeSingle();
    if (!pay) return ok();

    if (cb.ResultCode !== 0) {
      await admin.from("mpesa_payments").update({ status: "failed", result: cb.ResultDesc }).eq("id", pay.id);
      return ok();
    }

    const items: any[] = cb.CallbackMetadata?.Item ?? [];
    const paid = Number(items.find((i) => i.Name === "Amount")?.Value ?? 0);
    const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value ?? null;

    if (paid < pay.amount) {
      await admin.from("mpesa_payments").update({ status: "failed", result: "Amount paid was less than the price" }).eq("id", pay.id);
      return ok();
    }

    // Mark as paid only once, so a repeated callback cannot extend access twice
    const { data: claimed } = await admin.from("mpesa_payments")
      .update({ status: "paid", receipt, paid_at: new Date().toISOString() })
      .eq("id", pay.id).eq("status", "pending").select("id");
    if (!claimed || claimed.length === 0) return ok();

    // Extend from today, or from the current end date if it is still in the future
    const { data: sub } = await admin.from("subscriptions").select("paid_until")
      .eq("school_id", pay.school_id).maybeSingle();
    const now = new Date();
    const current = sub && new Date(sub.paid_until) > now ? new Date(sub.paid_until) : now;
    const next = new Date(current);
    next.setMonth(next.getMonth() + pay.months);
    await admin.from("subscriptions").upsert({ school_id: pay.school_id, paid_until: next.toISOString() });

    return ok();
  } catch (_e) {
    // Always answer M-Pesa with "Accepted" so it does not keep retrying
    return ok();
  }
});
