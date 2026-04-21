/* Developer: BANGDET.MD */
import http from "node:http"
import { PrettyLog } from "@/lib/pretty-log.js"
import { EVENTS } from "@/middleware.js"
import { getPendingPayment } from "../database/payment-store.js"

interface WebhookPayload {
    amount: number
    order_id: string
    project: string
    status: string
    payment_method: string
    completed_at: string
}

let server: http.Server | null = null

export function startWebhookServer(): void {
    const port = parseInt(process.env["WEBHOOK_PORT"] || "25577", 10)

    server = http.createServer((req, res) => {
        // Only accept POST to /webhook/pakasir
        if (req.method !== "POST" || req.url !== "/webhook/pakasir") {
            res.writeHead(404, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Not found" }))
            return
        }

        let body = ""
        req.on("data", (chunk: Buffer) => {
            body += chunk.toString()
        })

        req.on("end", () => {
            try {
                const payload: WebhookPayload = JSON.parse(body)
                PrettyLog.info(`[Webhook] Received payment notification: order_id=${payload.order_id}, status=${payload.status}, amount=${payload.amount}`)

                handleWebhookPayload(payload)

                res.writeHead(200, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ success: true }))
            } catch (error) {
                PrettyLog.error(`[Webhook] Failed to parse webhook payload: ${error}`)
                res.writeHead(400, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Invalid payload" }))
            }
        })
    })

    server.listen(port, () => {
        PrettyLog.logLoadStep(`Webhook server listening on port ${port}`)
    })

    server.on("error", (error) => {
        PrettyLog.error(`[Webhook] Server error: ${error}`)
    })
}

function handleWebhookPayload(payload: WebhookPayload): void {
    const expectedProject = process.env["PAKASIR_PROJECT"]

    // Validate project name
    if (payload.project !== expectedProject) {
        PrettyLog.warn(`[Webhook] Ignored: project mismatch (expected: ${expectedProject}, got: ${payload.project})`)
        return
    }

    // Only process completed payments
    if (payload.status !== "completed") {
        PrettyLog.info(`[Webhook] Ignored: payment status is '${payload.status}', not 'completed'`)
        return
    }

    // Find the pending payment
    const pendingPayment = getPendingPayment(payload.order_id)
    if (!pendingPayment) {
        PrettyLog.warn(`[Webhook] Ignored: no pending payment found for order_id=${payload.order_id}`)
        return
    }

    // Validate amount matches
    if (pendingPayment.amount !== payload.amount) {
        PrettyLog.warn(`[Webhook] Ignored: amount mismatch for order_id=${payload.order_id} (expected: ${pendingPayment.amount}, got: ${payload.amount})`)
        return
    }

    // Emit the paymentCompleted event
    PrettyLog.info(`[Webhook] Payment confirmed for order_id=${payload.order_id}, emitting paymentCompleted event`)
    EVENTS.emit("paymentCompleted", payload.order_id)
}

export function stopWebhookServer(): void {
    if (server) {
        server.close()
        server = null
        PrettyLog.info("[Webhook] Server stopped")
    }
}
