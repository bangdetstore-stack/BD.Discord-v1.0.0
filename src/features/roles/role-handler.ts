/* Developer: BANGDET.MD */
import { Client, Guild, GuildMember } from "discord.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { getUserPurchaseHistory } from "@/features/warranty/warranty-database.js"
import { getSetting } from "@/features/settings/database/settings-handler.js"

// VIP: berapa transaksi dalam berapa hari terakhir
const VIP_THRESHOLD  = 10
const VIP_PERIOD_MS  = 30 * 24 * 60 * 60 * 1000   // 30 hari

let discordClient: Client | null = null

export function setRoleClient(client: Client): void {
    discordClient = client
}

// ── Cari role ID untuk nama toko/produk secara dinamis dari settings ──────────
export function resolveShopRole(shopName: string, productName: string): string | null {
    const haystack = `${shopName} ${productName}`.toLowerCase()
    
    // Mapping keyword -> setting ID
    const keywordMap: Record<string, string> = {
        "netflix":       "roleNetflix",
        "spotify":       "roleSpotify",
        "youtube":       "roleYoutube",
        "hbo":           "roleHBO",
        "bstation":      "roleBstation",
        "capcut":        "roleCapcut",
        "capocut":       "roleCapcut",
        "canva":         "roleCanvaViu",
        "viu":           "roleCanvaViu",
        "prime video":   "rolePrime",
        "prime":         "rolePrime",
        "vidio":         "roleVidio",
        "wetv":          "roleWeTV",
    }

    for (const [keyword, settingId] of Object.entries(keywordMap)) {
        if (haystack.includes(keyword)) {
            const roleId = getSetting(settingId)?.value
            return (typeof roleId === "string" && roleId.trim() !== "") ? roleId : null
        }
    }
    return null
}

// ── Hitung transaksi user dalam 30 hari terakhir ─────────────────────────────
function countRecentTransactions(userId: string): number {
    const cutoff  = Date.now() - VIP_PERIOD_MS
    const history = getUserPurchaseHistory(userId)
    return history.filter(r => new Date(r.purchasedAt).getTime() >= cutoff).length
}

// ── Tambah role ke member (safe — skip jika sudah punya) ─────────────────────
async function safeAddRole(member: GuildMember, roleId: string | undefined | null, reason: string): Promise<void> {
    if (!roleId || typeof roleId !== "string" || roleId.trim() === "") return
    if (member.roles.cache.has(roleId)) return

    const role = member.guild.roles.cache.get(roleId) ?? await member.guild.roles.fetch(roleId).catch(() => null)
    if (!role) {
        PrettyLog.warn(`[Roles] Role ${roleId} tidak ditemukan di server — lewati (${reason})`)
        return
    }
    await member.roles.add(role, reason)
    PrettyLog.info(`[Roles] +${role.name} → ${member.user.username} (${reason})`)
}

// ── Handler utama: dipanggil setelah pembayaran berhasil ─────────────────────
export async function handlePurchaseRoles(
    userId:      string,
    guildId:     string,
    shopName:    string,
    productName: string,
): Promise<void> {
    if (!discordClient) return

    let guild: Guild
    try {
        guild = await discordClient.guilds.fetch(guildId)
    } catch {
        PrettyLog.warn(`[Roles] Tidak bisa fetch guild ${guildId}`)
        return
    }

    let member: GuildMember
    try {
        member = await guild.members.fetch(userId)
    } catch {
        PrettyLog.warn(`[Roles] User ${userId} tidak ada di guild ${guildId}`)
        return
    }

    // 1. Role Buyer (semua yang beli)
    const roleBuyer = getSetting("roleBuyer")?.value as string | undefined
    await safeAddRole(member, roleBuyer, "Pembeli produk").catch(() => {})

    // 2. Role per toko/produk
    const shopRoleId = resolveShopRole(shopName, productName)
    if (shopRoleId) {
        await safeAddRole(member, shopRoleId, `Beli ${productName}`).catch(() => {})
    }

    // 3. Role VIP (10x transaksi dalam 30 hari)
    const recentTx = countRecentTransactions(userId)
    if (recentTx >= VIP_THRESHOLD) {
        const roleVIP = getSetting("roleVIP")?.value as string | undefined
        await safeAddRole(member, roleVIP, `VIP: ${recentTx} transaksi dalam 30 hari`).catch(() => {})
    }
}

// ── Handler: dipanggil saat member join server ────────────────────────────────
export async function handleMemberJoinRole(member: GuildMember): Promise<void> {
    const roleJoin = getSetting("roleJoin")?.value as string | undefined
    await safeAddRole(member, roleJoin, "Bergabung ke server").catch(() => {})
}
