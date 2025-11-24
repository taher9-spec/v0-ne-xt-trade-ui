// process-webhooks/index.ts
// Edge Function to process webhook_log entries and call external webhooks
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
// @ts-ignore - JSR imports work at runtime in Deno
import { createClient } from "jsr:@supabase/supabase-js@2"

declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined
    }
    serve(handler: (req: Request) => Response | Promise<Response>): void
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  try {
    // Get pending webhook logs
    const { data: webhookLogs, error: fetchError } = await supabase
      .from("webhook_log")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50)

    if (fetchError) {
      console.error("[process-webhooks] Error fetching webhook logs:", fetchError)
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!webhookLogs || webhookLogs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending webhooks", processed: 0 }),
        { headers: { "Content-Type": "application/json" } }
      )
    }

    // Get active webhook subscribers for each event type
    const eventTypes = Array.from(new Set(webhookLogs.map((log) => log.event_type)))
    const { data: subscribers, error: subError } = await supabase
      .from("webhook_subscribers")
      .select("*")
      .in("event_type", eventTypes)
      .eq("is_active", true)

    if (subError) {
      console.error("[process-webhooks] Error fetching subscribers:", subError)
      return new Response(
        JSON.stringify({ error: subError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const processed: string[] = []
    const failed: string[] = []

    // Process each webhook log
    for (const log of webhookLogs) {
      const relevantSubscribers = (subscribers || []).filter(
        (sub) => sub.event_type === log.event_type
      )

      if (relevantSubscribers.length === 0) {
        // No subscribers, mark as processed
        await supabase
          .from("webhook_log")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
          })
          .eq("id", log.id)
        processed.push(log.id)
        continue
      }

      let allSucceeded = true

      // Call each subscriber's webhook URL
      for (const subscriber of relevantSubscribers) {
        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "User-Agent": "NeXT-TRADE-Webhook/1.0",
          }

          if (subscriber.secret_token) {
            headers["X-Webhook-Secret"] = subscriber.secret_token
          }

          const response = await fetch(subscriber.url, {
            method: "POST",
            headers,
            body: JSON.stringify({
              event_type: log.event_type,
              payload: log.payload,
              timestamp: log.created_at,
            }),
          })

          if (!response.ok) {
            console.error(
              `[process-webhooks] Webhook failed for ${subscriber.url}: ${response.status}`
            )
            allSucceeded = false
          }
        } catch (error: any) {
          console.error(
            `[process-webhooks] Error calling webhook ${subscriber.url}:`,
            error
          )
          allSucceeded = false
        }
      }

      // Update webhook log status
      const newStatus = allSucceeded ? "processed" : "failed"
      const updateData: any = {
        status: newStatus,
        attempts: (log.attempts || 0) + 1,
      }

      if (allSucceeded) {
        updateData.processed_at = new Date().toISOString()
      } else {
        updateData.error_message = "One or more webhook calls failed"
      }

      await supabase.from("webhook_log").update(updateData).eq("id", log.id)

      if (allSucceeded) {
        processed.push(log.id)
      } else {
        failed.push(log.id)
      }
    }

    return new Response(
      JSON.stringify({
        processed: processed.length,
        failed: failed.length,
        total: webhookLogs.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error: any) {
    console.error("[process-webhooks] Fatal error:", error)
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})

