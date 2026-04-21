/* Developer: BANGDET.MD */
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { Mutex } from "@/lib/mutex.js"
import { RenewalConfig, RenewalConfigsDB, RenewalRecord, RenewalTrackingDB } from "./renewal-types.js"

const CONFIGS_PATH  = "data/renewal-configs.json"
const TRACKING_PATH = "data/renewal-tracking.json"

const mutexes: Record<string, Mutex> = {
    [CONFIGS_PATH]: new Mutex(),
    [TRACKING_PATH]: new Mutex(),
}

let renewalConfigs: RenewalConfigsDB = {}
let renewalTracking: RenewalTrackingDB = {}

export async function loadRenewalDatabase(): Promise<void> {
    try {
        if (existsSync(CONFIGS_PATH)) renewalConfigs = JSON.parse(await fs.readFile(CONFIGS_PATH, "utf-8"))
        if (existsSync(TRACKING_PATH)) renewalTracking = JSON.parse(await fs.readFile(TRACKING_PATH, "utf-8"))
    } catch (e) {
        console.error("[RenewalDB] Gagal load database", e)
    }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
    const mutex = mutexes[filePath]
    if (!mutex) return
    const release = await mutex.acquire()
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 4), "utf-8")
    } catch (e) {
        console.error(`[RenewalDB] Gagal write ${filePath}`, e)
    } finally {
        release()
    }
}

// ── Renewal Configs (per-productId) ───────────────────────────────────────────

export function getRenewalConfigs(): RenewalConfigsDB {
    return renewalConfigs
}

export function getRenewalConfig(productId: string): RenewalConfig | null {
    return renewalConfigs[productId] ?? null
}

export function setRenewalConfig(productId: string, config: RenewalConfig): void {
    renewalConfigs[productId] = config
    void writeJson(CONFIGS_PATH, renewalConfigs)
}

export function deleteRenewalConfig(productId: string): void {
    delete renewalConfigs[productId]
    void writeJson(CONFIGS_PATH, renewalConfigs)
}

export function isRenewalEnabled(productId: string): boolean {
    return getRenewalConfig(productId)?.enabled === true
}

/** Returns the entire configs map — useful for dashboard listing. */
export function getAllRenewalConfigs(): RenewalConfigsDB {
    return renewalConfigs
}

/** Partial-merge save: merges fields into existing config for productId. */
export function saveRenewalConfig(productId: string, partial: Partial<RenewalConfig>): void {
    renewalConfigs[productId] = { ...(renewalConfigs[productId] ?? {}), ...partial } as RenewalConfig
    void writeJson(CONFIGS_PATH, renewalConfigs)
}

// ── Renewal Tracking (per-orderId) ────────────────────────────────────────────

export function getRenewalTracking(): RenewalTrackingDB {
    return renewalTracking
}

export function getRenewalRecord(orderId: string): RenewalRecord | null {
    return renewalTracking[orderId] ?? null
}

export function saveRenewalRecord(record: RenewalRecord): void {
    renewalTracking[record.orderId] = record
    void writeJson(TRACKING_PATH, renewalTracking)
}

export function updateRenewalRecord(orderId: string, updates: Partial<RenewalRecord>): RenewalRecord | null {
    if (!renewalTracking[orderId]) return null
    renewalTracking[orderId] = { ...renewalTracking[orderId], ...updates }
    void writeJson(TRACKING_PATH, renewalTracking)
    return renewalTracking[orderId]
}

export function deleteRenewalRecord(orderId: string): void {
    delete renewalTracking[orderId]
    void writeJson(TRACKING_PATH, renewalTracking)
}

export function getRenewalRecordByRenewalOrderId(renewalOrderId: string): RenewalRecord | null {
    return Object.values(renewalTracking).find(r => r.renewalOrderId === renewalOrderId) ?? null
}

export function getAllRenewalRecords(): RenewalRecord[] {
    return Object.values(renewalTracking)
}

export function getActiveRenewalForOrder(orderId: string): RenewalRecord | null {
    const record = getRenewalRecord(orderId)
    if (!record) return null
    const terminal: string[] = ["completed", "buyer-declined", "admin-rejected", "no-response"]
    if (terminal.includes(record.status)) return null
    return record
}

/**
 * Returns a terminal record for the given orderId whose warrantyExpiresAt matches
 * the given expiryStr (same ISO date string). Used by checker to prevent re-creating
 * a new renewal flow for the same expiry cycle after a terminal state (reject/decline/
 * no-response). Returns null when the expiry has changed (e.g. warranty was extended).
 */
export function getExpiryMatchingTerminalRecord(orderId: string, expiryStr: string): RenewalRecord | null {
    const record = getRenewalRecord(orderId)
    if (!record) return null
    const terminal: string[] = ["completed", "buyer-declined", "admin-rejected", "no-response"]
    if (!terminal.includes(record.status)) return null
    // Same cycle: expiry string matches
    if (record.warrantyExpiresAt === expiryStr) return record
    return null
}
