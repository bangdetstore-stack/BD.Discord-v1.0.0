/* Developer: BANGDET.MD */
import { Client } from "discord.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { getWarrantySubmissions, getClaimTickets, getUserPurchaseHistory } from "@/features/warranty/warranty-database.js"
import {
    getAllRenewalRecords,
    getActiveRenewalForOrder,
    getRenewalRecord,
    saveRenewalRecord,
    deleteRenewalRecord,
    isRenewalEnabled,
    getExpiryMatchingTerminalRecord,
} from "./renewal-database.js"
import {
    sendAdminRenewalNotification,
    sendBuyerNoResponseNotif,
} from "./renewal-flow.js"
import { RenewalRecord } from "./renewal-types.js"

const CHECK_INTERVAL_MS  = 30 * 60 * 1000   // 30 minutes
const HOURS_BEFORE_H4    = 4 * 24            // H-4 in hours
const HOURS_BEFORE_H2    = 2 * 24            // H-2 in hours

function hasOpenClaim(orderId: string): boolean {
    const tickets = getClaimTickets()
    return Object.values(tickets).some(t => t.orderId === orderId && t.status === "open")
}

function hoursUntilExpiry(warrantyExpiresAt: string): number {
    const now     = Date.now()
    const expiry  = new Date(warrantyExpiresAt).getTime()
    return (expiry - now) / (1000 * 60 * 60)
}

async function runCheckerCycle(): Promise<void> {
    try {
        const submissions = getWarrantySubmissions()
        const now         = Date.now()

        // ── 1. Scan warranty submissions for eligible orders ──────────────────
        for (const submission of Object.values(submissions)) {
            if (!submission.warrantyExpiresAt) continue

            const hoursLeft = hoursUntilExpiry(submission.warrantyExpiresAt)
            if (hoursLeft < 0) continue  // already expired

            if (!isRenewalEnabled(submission.productId)) continue

            if (hasOpenClaim(submission.orderId)) continue

            const existing = getActiveRenewalForOrder(submission.orderId)

            // Skip: a terminal record (rejected/declined/no-response) already exists for
            // this exact expiry cycle. Only allow re-creation when warrantyExpiresAt changes
            // (e.g., after a completed renewal extends the warranty to a new date).
            if (!existing && getExpiryMatchingTerminalRecord(submission.orderId, submission.warrantyExpiresAt)) continue

            // H-4: send admin notification if not yet notified
            if (hoursLeft <= HOURS_BEFORE_H4 && !existing) {
                const history = getUserPurchaseHistory(submission.userId)
                const purchase = history.find(h => h.orderId === submission.orderId)
                if (!purchase) continue

                const record: RenewalRecord = {
                    orderId:           submission.orderId,
                    userId:            submission.userId,
                    productId:         submission.productId,
                    productName:       submission.productName,
                    shopId:            purchase.shopId,
                    shopName:          submission.shopName,
                    guildId:           submission.guildId,
                    warrantyExpiresAt: submission.warrantyExpiresAt,
                    status:            "watching",
                    isManual:          false,
                    createdAt:         new Date().toISOString(),
                }

                saveRenewalRecord(record)
                await sendAdminRenewalNotification(record)
                continue
            }

            // H-2: if admin not responded by H-2, notify buyer
            if (hoursLeft <= HOURS_BEFORE_H2 && existing && existing.status === "admin-notified") {
                await sendBuyerNoResponseNotif(existing)
                continue
            }

            // Retry: if record is stuck in "watching" (admin notification never confirmed),
            // try sending admin notification again as long as we're within the H-4 window
            if (existing && existing.status === "watching" && !existing.adminNotifiedAt && hoursLeft <= HOURS_BEFORE_H4) {
                PrettyLog.warn(`[Renewal] Retrying stuck admin notification for order ${existing.orderId}`)
                await sendAdminRenewalNotification(existing)
                continue
            }
        }

        // ── 2. Recovery: reset stale payment-pending records ─────────────────
        // If a payment-pending invoice was never paid, it expired in 15 minutes.
        // On restart (or next cycle), recover such records to buyer-notified state.
        const PAYMENT_TTL_MS = 20 * 60 * 1000  // 20 min generous TTL (invoice is 15 min)
        for (const record of getAllRenewalRecords()) {
            if (record.status !== "payment-pending") continue
            if (!record.paymentCreatedAt) continue
            const paymentAge = now - new Date(record.paymentCreatedAt).getTime()
            if (paymentAge > PAYMENT_TTL_MS) {
                PrettyLog.warn(`[Renewal] Recovery: reset stale payment-pending record ${record.orderId} → buyer-notified`)
                const rec = getRenewalRecord(record.orderId)
                if (rec) saveRenewalRecord({ ...rec, status: "buyer-notified", renewalOrderId: undefined, renewalAmount: undefined })
            }
        }

        // ── 3. Stale non-terminal record archival ────────────────────────────
        // Any record still in a non-terminal state whose warranty has been expired
        // for more than 10 days should be archived as "no-response" and scheduled
        // for immediate cleanup. This prevents indefinite record accumulation.
        const terminal = ["completed", "buyer-declined", "admin-rejected", "no-response"]
        const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000
        for (const record of getAllRenewalRecords()) {
            if (terminal.includes(record.status)) continue  // already terminal
            if (!record.warrantyExpiresAt) continue
            const expiryMs = new Date(record.warrantyExpiresAt).getTime()
            if (now - expiryMs < TEN_DAYS_MS) continue  // not old enough yet
            // Warranty expired >10 days ago, record is stale → archive it
            PrettyLog.warn(`[Renewal] Archiving stale record ${record.orderId} (status: ${record.status}) → no-response`)
            const rec = getRenewalRecord(record.orderId)
            if (rec) {
                saveRenewalRecord({
                    ...rec,
                    status:    "no-response",
                    cleanupAt: new Date(now).toISOString(),  // immediate cleanup next cycle
                })
            }
        }

        // ── 4. Cleanup records that have reached their cleanupAt date ─────────
        const allRecords = getAllRenewalRecords()
        for (const record of allRecords) {
            if (!record.cleanupAt) continue
            if (new Date(record.cleanupAt).getTime() < now) {
                deleteRenewalRecord(record.orderId)
                PrettyLog.info(`[Renewal] Cleanup record ${record.orderId}`)
            }
        }

        // ── 5. Auto-schedule cleanup for terminal records that lack cleanupAt ──
        for (const record of allRecords) {
            if (terminal.includes(record.status) && !record.cleanupAt) {
                const expiry  = record.warrantyExpiresAt
                    ? new Date(record.warrantyExpiresAt).getTime()
                    : now
                const cleanup = new Date(Math.max(expiry, now) + TEN_DAYS_MS)
                const rec = getRenewalRecord(record.orderId)
                if (rec) {
                    saveRenewalRecord({ ...rec, cleanupAt: cleanup.toISOString() })
                }
            }
        }

    } catch (error) {
        PrettyLog.error(`[Renewal] Error dalam checker cycle: ${error}`)
    }
}

export function startRenewalChecker(_client: Client): void {
    PrettyLog.logLoadStep("Renewal checker started (interval: 30 min)")
    void runCheckerCycle()
    setInterval(() => { void runCheckerCycle() }, CHECK_INTERVAL_MS)
}
