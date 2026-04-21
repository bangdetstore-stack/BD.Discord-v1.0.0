/* Developer: BANGDET.MD */
import { PendingPayment } from "./payment-types.js"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { PrettyLog } from "@/lib/pretty-log.js"
import { Mutex } from "@/lib/mutex.js"

const mutex = new Mutex()

const STORE_PATH = "data/pending-payments.json"
const DELIVERED_PATH = "data/delivered-orders.json"
const pendingPayments: Map<string, PendingPayment> = new Map()
let deliveredOrders: Set<string> = new Set()

// ── Persistence ──────────────────────────────────────────────────────────────

async function saveToFile(): Promise<void> {
    const release = await mutex.acquire()
    try {
        const data = Array.from(pendingPayments.values()).map(p => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
            expiredAt: p.expiredAt.toISOString(),
        }))
        await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf-8")
    } catch (e) {
        PrettyLog.error(`[PaymentStore] Gagal menyimpan ke file: ${e}`)
    } finally {
        release()
    }
}

export async function loadPendingPayments(): Promise<void> {
    if (!existsSync(STORE_PATH)) return
    try {
        const raw = await fs.readFile(STORE_PATH, "utf-8")
        const data = JSON.parse(raw) as Array<Record<string, unknown>>
        let loaded = 0

        for (const item of data) {
            if (item["status"] !== "pending") continue

            const payment: PendingPayment = {
                ...(item as Omit<PendingPayment, "createdAt" | "expiredAt">),
                createdAt: new Date(item["createdAt"] as string),
                expiredAt: new Date(item["expiredAt"] as string),
            }

            // Jangan muat payment yang sudah expired
            if (payment.expiredAt < new Date()) continue

            pendingPayments.set(payment.orderId, payment)
            loaded++
        }

        if (loaded > 0) {
            PrettyLog.logLoadStep(`Memuat ${loaded} pending payment dari file`)
        }

        // Simpan ulang (hapus yang sudah expired dari file)
        void saveToFile()
    } catch (e) {
        PrettyLog.error(`[PaymentStore] Gagal memuat dari file: ${e}`)
    }

    if (!existsSync(DELIVERED_PATH)) return
    try {
        const rawDelivered = await fs.readFile(DELIVERED_PATH, "utf-8")
        const parsed = JSON.parse(rawDelivered) as string[]
        deliveredOrders = new Set(parsed)
    } catch (e) {
        PrettyLog.error(`[PaymentStore] Gagal memuat delivered orders: ${e}`)
    }
}

export async function checkAndMarkDelivered(orderId: string): Promise<boolean> {
    if (deliveredOrders.has(orderId)) return true
    
    deliveredOrders.add(orderId)
    const release = await mutex.acquire()
    try {
        await fs.writeFile(DELIVERED_PATH, JSON.stringify(Array.from(deliveredOrders), null, 2), "utf-8")
    } catch (e) {
        PrettyLog.error(`[PaymentStore] Gagal menyimpan delivered orders: ${e}`)
    } finally {
        release()
    }
    
    return false // Means it was NOT delivered before, safe to deliver
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export function addPendingPayment(payment: PendingPayment): void {
    pendingPayments.set(payment.orderId, payment)
    saveToFile()
}

export function getPendingPayment(orderId: string): PendingPayment | undefined {
    return pendingPayments.get(orderId)
}

export function removePendingPayment(orderId: string): void {
    pendingPayments.delete(orderId)
    saveToFile()
}

/**
 * Update status pembayaran.
 * Guard: tidak akan menimpa status terminal ("completed" / "canceled") dengan "expired".
 * Ini mencegah race condition antara webhook dan expiry timer.
 */
export function updatePendingPaymentStatus(
    orderId: string,
    status: PendingPayment["status"]
): PendingPayment | undefined {
    const payment = pendingPayments.get(orderId)
    if (!payment) return undefined

    const isTerminal = payment.status === "completed" || payment.status === "canceled"
    if (isTerminal && status === "expired") {
        // Jangan timpa status terminal dengan expired
        return payment
    }

    payment.status = status
    pendingPayments.set(orderId, payment)
    saveToFile()
    return payment
}

export function getPaymentByUserId(userId: string): PendingPayment | undefined {
    for (const payment of pendingPayments.values()) {
        if (payment.userId === userId && payment.status === "pending") {
            return payment
        }
    }
    return undefined
}

export function getAllPendingPayments(): Map<string, PendingPayment> {
    return pendingPayments
}
