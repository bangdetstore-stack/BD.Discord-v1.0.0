/* Developer: BANGDET.MD */
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { Mutex } from "@/lib/mutex.js"
import {
    ProductFormConfig,
    ProductFormsDB,
    PendingWarranty,
    PendingWarrantiesDB,
    WarrantySubmission,
    WarrantySubmissionsDB,
    PurchaseRecord,
    PurchaseHistoryDB,
    ClaimTicket,
    ClaimTicketsDB,
} from "./warranty-types.js"

const FORMS_PATH     = "data/product-forms.json"
const PENDING_PATH   = "data/pending-warranties.json"
const SUBMITTED_PATH = "data/warranty-submissions.json"
const HISTORY_PATH   = "data/purchase-history.json"
const CLAIMS_PATH    = "data/claim-tickets.json"
const SCREENSHOTS_PATH = "data/pending-screenshots.json"

const mutexes: Record<string, Mutex> = {
    [FORMS_PATH]: new Mutex(),
    [PENDING_PATH]: new Mutex(),
    [SUBMITTED_PATH]: new Mutex(),
    [HISTORY_PATH]: new Mutex(),
    [CLAIMS_PATH]: new Mutex(),
    [SCREENSHOTS_PATH]: new Mutex(),
}

let productForms: ProductFormsDB = {}
let pendingWarranties: PendingWarrantiesDB = {}
let warrantySubmissions: WarrantySubmissionsDB = {}
let purchaseHistory: PurchaseHistoryDB = {}
let claimTickets: ClaimTicketsDB = {}

export interface PartialSubmission {
    orderId: string
    field1?: string
    field2?: string
}
let pendingScreenshots: Record<string, PartialSubmission> = {}

export async function loadWarrantyDatabase(): Promise<void> {
    try {
        if (existsSync(FORMS_PATH)) productForms = JSON.parse(await fs.readFile(FORMS_PATH, "utf-8"))
        if (existsSync(PENDING_PATH)) pendingWarranties = JSON.parse(await fs.readFile(PENDING_PATH, "utf-8"))
        if (existsSync(SUBMITTED_PATH)) warrantySubmissions = JSON.parse(await fs.readFile(SUBMITTED_PATH, "utf-8"))
        if (existsSync(HISTORY_PATH)) purchaseHistory = JSON.parse(await fs.readFile(HISTORY_PATH, "utf-8"))
        if (existsSync(CLAIMS_PATH)) claimTickets = JSON.parse(await fs.readFile(CLAIMS_PATH, "utf-8"))
        if (existsSync(SCREENSHOTS_PATH)) pendingScreenshots = JSON.parse(await fs.readFile(SCREENSHOTS_PATH, "utf-8"))
        
        const COUNTER_PATH = "data/ticket-counter.json"
        if (existsSync(COUNTER_PATH)) {
            const counterData = JSON.parse(await fs.readFile(COUNTER_PATH, "utf-8"))
            ticketCounter = counterData.lastNumber ?? 0
        } else {
            // Default: use existing highest claim ticket number logic
            ticketCounter = Object.keys(claimTickets).length
        }
    } catch (e) {
        console.error("[WarrantyDB] Gagal load database", e)
    }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
    const mutex = mutexes[filePath]
    if (!mutex) return
    const release = await mutex.acquire()
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 4), "utf-8")
    } catch (e) {
        console.error(`[WarrantyDB] Gagal write ${filePath}`, e)
    } finally {
        release()
    }
}

// ── Product Form Config ────────────────────────────────────────────────────────

export function getProductForms(): ProductFormsDB {
    return productForms
}

export function getProductForm(productId: string): ProductFormConfig | null {
    return productForms[productId] ?? null
}

export function setProductForm(productId: string, config: ProductFormConfig): void {
    productForms[productId] = config
    void writeJson(FORMS_PATH, productForms)
}

// ── Pending Warranties ─────────────────────────────────────────────────────────

export function getPendingWarranties(): PendingWarrantiesDB {
    return pendingWarranties
}

export function addPendingWarranty(warranty: PendingWarranty): void {
    pendingWarranties[warranty.orderId] = warranty
    void writeJson(PENDING_PATH, pendingWarranties)
}

export function getPendingWarranty(orderId: string): PendingWarranty | null {
    return pendingWarranties[orderId] ?? null
}

export function markReminderSent(orderId: string): void {
    if (pendingWarranties[orderId]) {
        pendingWarranties[orderId].reminderSent = true
        void writeJson(PENDING_PATH, pendingWarranties)
    }
}

export function removePendingWarranty(orderId: string): void {
    delete pendingWarranties[orderId]
    void writeJson(PENDING_PATH, pendingWarranties)
}

// ── Warranty Submissions ───────────────────────────────────────────────────────

export function saveWarrantySubmission(submission: WarrantySubmission): void {
    warrantySubmissions[submission.orderId] = submission
    void writeJson(SUBMITTED_PATH, warrantySubmissions)
}

export function getWarrantySubmissions(): WarrantySubmissionsDB {
    return warrantySubmissions
}

export function getWarrantySubmission(orderId: string): WarrantySubmission | null {
    return warrantySubmissions[orderId] ?? null
}

export function getWarrantySubmissionsByUser(userId: string): WarrantySubmission[] {
    return Object.values(warrantySubmissions).filter(s => s.userId === userId)
}

// ── Purchase History ───────────────────────────────────────────────────────────

export function getPurchaseHistory(): PurchaseHistoryDB {
    return purchaseHistory
}

export function addPurchaseRecord(userId: string, record: PurchaseRecord): void {
    if (!purchaseHistory[userId]) purchaseHistory[userId] = []
    const exists = purchaseHistory[userId].some(r => r.orderId === record.orderId)
    if (!exists) purchaseHistory[userId].push(record)
    void writeJson(HISTORY_PATH, purchaseHistory)
}

export function getUserPurchaseHistory(userId: string): PurchaseRecord[] {
    return purchaseHistory[userId] ?? []
}

export function getPurchaseRecord(userId: string, orderId: string): PurchaseRecord | null {
    return getUserPurchaseHistory(userId).find(r => r.orderId === orderId) ?? null
}

// ── Claim Tickets ──────────────────────────────────────────────────────────────

export function getClaimTickets(): ClaimTicketsDB {
    return claimTickets
}

export function addClaimTicket(ticket: ClaimTicket): void {
    claimTickets[ticket.ticketId] = ticket
    void writeJson(CLAIMS_PATH, claimTickets)
}

export function getClaimTicket(ticketId: string): ClaimTicket | null {
    return claimTickets[ticketId] ?? null
}

export function getClaimTicketByThread(threadId: string): ClaimTicket | null {
    return Object.values(claimTickets).find(t => t.threadId === threadId) ?? null
}

export function closeClaimTicketDb(ticketId: string): void {
    if (claimTickets[ticketId]) {
        claimTickets[ticketId].status = "closed"
        claimTickets[ticketId].closedAt = new Date().toISOString()
        void writeJson(CLAIMS_PATH, claimTickets)
    }
}

const COUNTER_PATH = "data/ticket-counter.json"
let ticketCounter = 0

export function getClaimCountForOrder(orderId: string): number {
    return Object.values(claimTickets).filter(t => t.orderId === orderId).length
}

export function getNextTicketNumber(): number {
    ticketCounter += 1
    // Write in background
    const mutex = mutexes[CLAIMS_PATH] // Reuse CLAIMS_PATH mutex to avoid making a new one, or just write it
    if (mutex) {
        mutex.acquire().then(release => {
            fs.writeFile(COUNTER_PATH, JSON.stringify({ lastNumber: ticketCounter }), "utf-8")
              .catch(e => console.error("[WarrantyDB] Gagal write counter", e))
              .finally(() => release())
        })
    }
    return ticketCounter
}

export function deleteClaimTicket(ticketId: string): void {
    delete claimTickets[ticketId]
    void writeJson(CLAIMS_PATH, claimTickets)
}

// ── Pending Screenshots ────────────────────────────────────────────────────────

export function getPendingScreenshot(userId: string): PartialSubmission | null {
    return pendingScreenshots[userId] ?? null
}

export function setPendingScreenshot(userId: string, data: PartialSubmission): void {
    pendingScreenshots[userId] = data
    void writeJson(SCREENSHOTS_PATH, pendingScreenshots)
}

export function removePendingScreenshot(userId: string): void {
    delete pendingScreenshots[userId]
    void writeJson(SCREENSHOTS_PATH, pendingScreenshots)
}
