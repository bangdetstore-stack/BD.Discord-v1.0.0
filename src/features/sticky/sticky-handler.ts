/* Developer: BANGDET.MD */
import { Client, Message, TextChannel } from "discord.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { Mutex } from "@/lib/mutex.js"

const STICKY_PATH = "data/sticky-messages.json"
const mutex = new Mutex()

interface StickyEntry {
    content: string
    messageId: string | null
}

type StickyDB = Record<string, StickyEntry>

let stickyDb: StickyDB = {}

export async function loadStickyDatabase(): Promise<void> {
    try {
        if (existsSync(STICKY_PATH)) {
            const raw = await fs.readFile(STICKY_PATH, "utf-8")
            stickyDb = JSON.parse(raw) as StickyDB
        }
    } catch (e) {
        PrettyLog.error(`[Sticky] Gagal load database: ${e}`)
    }
}

async function writeSticky(): Promise<void> {
    const release = await mutex.acquire()
    try {
        if (!existsSync("data")) await fs.mkdir("data", { recursive: true })
        await fs.writeFile(STICKY_PATH, JSON.stringify(stickyDb, null, 4), "utf-8")
    } catch (e) {
        PrettyLog.error(`[Sticky] Gagal write database: ${e}`)
    } finally {
        release()
    }
}

export function getStickyForChannel(channelId: string): StickyEntry | null {
    return stickyDb[channelId] ?? null
}

export function setSticky(channelId: string, content: string): void {
    stickyDb[channelId] = { content, messageId: null }
    void writeSticky()
}

export function clearSticky(channelId: string): void {
    delete stickyDb[channelId]
    void writeSticky()
}

export function updateStickyMessageId(channelId: string, messageId: string | null): void {
    if (stickyDb[channelId]) {
        stickyDb[channelId].messageId = messageId
        void writeSticky()
    }
}

// ── Cooldown sederhana per channel (cegah spam delete/resend) ─────────────────
const cooldowns = new Map<string, NodeJS.Timeout>()
const COOLDOWN_MS = 2000

// ── Dipanggil dari message-create setiap ada pesan baru di guild ──────────────
export async function handleStickyMessage(message: Message): Promise<void> {
    const channelId = message.channelId
    const sticky = getStickyForChannel(channelId)
    if (!sticky) return

    // Jangan react ke pesan bot sendiri
    if (message.author.bot && message.author.id === message.client.user?.id) return

    // Cooldown agar tidak delete/resend terlalu cepat
    if (cooldowns.has(channelId)) return
    cooldowns.set(channelId, setTimeout(() => cooldowns.delete(channelId), COOLDOWN_MS))

    const channel = message.channel
    if (!channel.isTextBased() || channel.isDMBased()) return

    // Hapus pesan sticky lama
    if (sticky.messageId) {
        try {
            const old = await (channel as TextChannel).messages.fetch(sticky.messageId)
            await old.delete()
        } catch {
            // Pesan mungkin sudah dihapus manual — tidak apa-apa
        }
        updateStickyMessageId(channelId, null)
    }

    // Kirim sticky baru di bawah
    try {
        const sent = await (channel as TextChannel).send(sticky.content)
        updateStickyMessageId(channelId, sent.id)
    } catch (e) {
        PrettyLog.error(`[Sticky] Gagal kirim sticky di channel ${channelId}: ${e}`)
    }
}

// ── Kirim sticky saat bot startup (agar sticky ada di bottom setelah restart) ─
export async function restoreStickyMessages(client: Client): Promise<void> {
    for (const [channelId, sticky] of Object.entries(stickyDb)) {
        try {
            const channel = await client.channels.fetch(channelId)
            if (!channel || !channel.isTextBased() || channel.isDMBased()) continue

            // Hapus sticky lama jika ada
            if (sticky.messageId) {
                try {
                    const old = await (channel as TextChannel).messages.fetch(sticky.messageId)
                    await old.delete()
                } catch { /* sudah terhapus */ }
                updateStickyMessageId(channelId, null)
            }

            const sent = await (channel as TextChannel).send(sticky.content)
            updateStickyMessageId(channelId, sent.id)
            PrettyLog.info(`[Sticky] Sticky di-restore di channel ${channelId}`)
        } catch (e) {
            PrettyLog.warn(`[Sticky] Gagal restore sticky ${channelId}: ${e}`)
        }
    }
}
