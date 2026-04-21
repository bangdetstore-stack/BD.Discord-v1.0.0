/* Developer: BANGDET.MD */
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import crypto from "node:crypto"
import { PrettyLog } from "@/lib/pretty-log.js"
import { handleApiRequest } from "./api-routes.js"
import { EVENTS } from "@/middleware.js"
import { getPendingPayment } from "@/features/payment/database/payment-store.js"
import { getRenewalRecordByRenewalOrderId } from "@/features/renewal/renewal-database.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}

interface WebhookPayload {
    amount: number
    order_id: string
    project: string
    status: string
    payment_method: string
    completed_at: string
}

let server: http.Server | null = null

export function startDashboardServer(): void {
    const port = parseInt(process.env["SERVER_PORT"] || process.env["DASHBOARD_PORT"] || "3000", 10)
    const publicDir = path.resolve(process.cwd(), "src", "dashboard", "public")

    if (!process.env["DASHBOARD_SECRET"]) {
        PrettyLog.warn(
            "[Dashboard] ⚠️  DASHBOARD_SECRET is not set — the API is publicly accessible with NO authentication. " +
            "Set DASHBOARD_SECRET in your environment variables to secure the dashboard."
        )
    }

    server = http.createServer(async (req, res) => {
        const url = new URL(req.url || "/", `http://${req.headers.host}`)

        // ====== WEBHOOK ROUTE (Pakasir) ======
        if (url.pathname === "/webhook/pakasir" && req.method === "POST") {
            handleWebhook(req, res)
            return
        }

        // ====== API ROUTES ======
        if (url.pathname.startsWith("/api/")) {
            try {
                const handled = await handleApiRequest(req, res)
                if (!handled) {
                    res.writeHead(404, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ error: "API endpoint not found" }))
                }
            } catch (error) {
                PrettyLog.error(`[Dashboard] API error: ${error}`)
                res.writeHead(500, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Internal server error" }))
            }
            return
        }

        // ====== STATIC FILES (Dashboard) ======
        let filePath = path.join(publicDir, url.pathname === "/" ? "index.html" : url.pathname)
        
        if (!filePath.startsWith(publicDir)) {
            res.writeHead(403)
            res.end("Forbidden")
            return
        }

        const ext = path.extname(filePath).toLowerCase()
        const contentType = MIME_TYPES[ext] || "application/octet-stream"

        try {
            if (!ext) {
                filePath = path.join(publicDir, "index.html")
            }

            const content = fs.readFileSync(filePath)
            res.writeHead(200, { "Content-Type": contentType })
            res.end(content)
        } catch {
            try {
                const indexContent = fs.readFileSync(path.join(publicDir, "index.html"))
                res.writeHead(200, { "Content-Type": "text/html" })
                res.end(indexContent)
            } catch {
                res.writeHead(404, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Dashboard files not found. Make sure src/dashboard/public/ exists." }))
            }
        }
    })

    server.listen(port, "0.0.0.0", () => {
        const host = process.env["SERVER_IP"] || process.env["HOST"] || "localhost"
        PrettyLog.logLoadStep(`Dashboard running`, `→ http://${host}:${port}`)
        PrettyLog.info(`[Dashboard] Webhook endpoint → http://${host}:${port}/webhook/pakasir`)
    })

    server.on("error", (error) => {
        PrettyLog.error(`[Dashboard] Server error: ${error}`)
    })
}

// ====== WEBHOOK HANDLER ======
const MAX_WEBHOOK_BODY = 20 * 1024 // 20 KB — any legit Pakasir payload is well under this

function handleWebhook(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = ""
    let bodyExceeded = false

    req.on("data", (chunk: Buffer) => {
        body += chunk.toString()
        if (body.length > MAX_WEBHOOK_BODY && !bodyExceeded) {
            bodyExceeded = true
            PrettyLog.warn(`[Webhook] Payload too large (>${MAX_WEBHOOK_BODY} bytes) — rejected`)
            res.writeHead(413, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Payload too large" }))
            req.destroy()
        }
    })

    req.on("end", () => {
        if (bodyExceeded) return
        try {
            const signature = req.headers["x-pakasir-signature"]
            const apiKey = process.env["PAKASIR_API_KEY"] || ""

            if (!signature) {
                PrettyLog.warn(`[Webhook] Missing X-Pakasir-Signature header`)
                res.writeHead(401, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Missing signature" }))
                return
            }

            const hmac = crypto.createHmac("sha256", apiKey)
            hmac.update(body)
            const expectedSignature = hmac.digest("hex")

            if (signature !== expectedSignature) {
                PrettyLog.warn(`[Webhook] Invalid signature`)
                res.writeHead(401, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ error: "Invalid signature" }))
                return
            }

            const payload: WebhookPayload = JSON.parse(body)
            PrettyLog.info(`[Webhook] Payment notification: order_id=${payload.order_id}, status=${payload.status}`)

            const expectedProject = process.env["PAKASIR_PROJECT"]
            if (payload.project !== expectedProject) {
                PrettyLog.warn(`[Webhook] Ignored: project mismatch`)
                res.writeHead(200, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ success: true }))
                return
            }

            if (payload.status === "completed") {
                // Check if this is a renewal payment (RNW- prefix)
                if (payload.order_id.startsWith("RNW-")) {
                    const renewalRecord = getRenewalRecordByRenewalOrderId(payload.order_id)
                    if (renewalRecord && renewalRecord.renewalAmount === payload.amount) {
                        PrettyLog.info(`[Webhook] Renewal payment confirmed: order_id=${payload.order_id}`)
                        EVENTS.emit("paymentCompleted", payload.order_id)
                    } else if (renewalRecord) {
                        PrettyLog.warn(`[Webhook] Renewal amount mismatch: expected ${renewalRecord.renewalAmount}, got ${payload.amount} — rejected`)
                    } else {
                        PrettyLog.warn(`[Webhook] No renewal record found for order_id=${payload.order_id}`)
                    }
                } else {
                    const pendingPayment = getPendingPayment(payload.order_id)
                    if (pendingPayment && pendingPayment.amount === payload.amount) {
                        PrettyLog.info(`[Webhook] Payment confirmed: order_id=${payload.order_id}`)
                        EVENTS.emit("paymentCompleted", payload.order_id)
                    }
                }
            }

            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ success: true }))
        } catch (error) {
            PrettyLog.error(`[Webhook] Parse error: ${error}`)
            res.writeHead(400, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ error: "Invalid payload" }))
        }
    })
}

export function stopDashboardServer(): void {
    if (server) {
        server.close()
        server = null
    }
}
