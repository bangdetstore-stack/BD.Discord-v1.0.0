/* Developer: BANGDET.MD */
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    Client,
    Colors,
    EmbedBuilder,
    MessageComponentInteraction,
} from "discord.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { getSetting } from "@/features/settings/database/settings-handler.js"
import { getWarrantySubmission, saveWarrantySubmission, getUserPurchaseHistory, getClaimTickets } from "@/features/warranty/warranty-database.js"
import { getProducts } from "@/features/shops/database/products-database.js"
import { createQrisPayment } from "@/features/payment/service/pakasir-service.js"
import {
    getRenewalRecord,
    getRenewalRecordByRenewalOrderId,
    getRenewalConfig,
    saveRenewalRecord,
    updateRenewalRecord,
    isRenewalEnabled,
    getAllRenewalRecords,
} from "./renewal-database.js"
import { RenewalRecord } from "./renewal-types.js"
import { EVENTS } from "@/middleware.js"

let discordClient: Client | null = null

export function setRenewalClient(client: Client): void {
    discordClient = client
}

/**
 * Dipanggil saat bot startup. Setiap record renewal dengan status `payment-pending`
 * yang QRIS-nya sudah expired (paymentCreatedAt + 15 menit < sekarang) di-reset
 * kembali ke `buyer-notified` agar user bisa coba lagi.
 */
export function restoreRenewalPaymentTimers(): void {
    const QRIS_TTL_MS = 15 * 60 * 1000 // 15 menit
    const now = Date.now()
    const records = getAllRenewalRecords()

    for (const record of records) {
        if (record.status !== "payment-pending") continue
        if (!record.paymentCreatedAt) continue

        const createdAt = new Date(record.paymentCreatedAt).getTime()
        if (now - createdAt >= QRIS_TTL_MS) {
            // QRIS sudah expired saat bot offline — reset ke buyer-notified
            updateRenewalRecord(record.orderId, {
                status:           "buyer-notified",
                renewalOrderId:   undefined,
                paymentCreatedAt: undefined,
            })
            PrettyLog.warn(
                `[Renewal] Record ${record.orderId} direset dari payment-pending → buyer-notified (QRIS expired saat bot offline)`
            )
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAdminChannelId(productId?: string): string | null {
    if (productId) {
        const config = getRenewalConfig(productId)
        if (config?.notifyChannelId) return config.notifyChannelId
    }
    const renewalCh = getSetting("renewalChannelId")
    if (renewalCh?.value && typeof renewalCh.value === "string") return renewalCh.value
    const logCh = getSetting("logChannelId")
    if (logCh?.value && typeof logCh.value === "string") return logCh.value
    return null
}

function getAdminRoleMentions(productId?: string): string {
    if (productId) {
        const config = getRenewalConfig(productId)
        if (config?.notifyRoles) {
            const roles = config.notifyRoles.split(",").map(r => r.trim()).filter(Boolean)
            if (roles.length) return roles.map(r => `<@&${r}>`).join(" ")
        }
    }
    const rolesSetting = getSetting("renewalAdminRoles")
    if (!rolesSetting?.value) return ""
    const roles = String(rolesSetting.value).split(",").map(r => r.trim()).filter(Boolean)
    return roles.map(r => `<@&${r}>`).join(" ")
}

function calcPrice(productId: string, shopId: string, durationDays: 30 | 60 | 90): number {
    const [err, products] = getProducts(shopId)
    if (err || !products) return 0
    const product = products.get(productId)
    if (!product) return 0
    const months = durationDays / 30
    return product.price * months
}

function renewalOrderId(): string {
    return `RNW-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`
}

function expiryDateStr(currentExpiry: string, days: number): string {
    const base = new Date(currentExpiry)
    base.setDate(base.getDate() + days)
    return base.toISOString()
}

function formatRp(amount: number): string {
    return `Rp ${amount.toLocaleString("id-ID")}`
}

// ── Build action rows ─────────────────────────────────────────────────────────

function buildAdminButtons(orderId: string, disabled = false): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`renewal-admin-approve+${orderId}`)
            .setLabel("✅ Setuju Perpanjang")
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`renewal-admin-reject+${orderId}`)
            .setLabel("❌ Tolak")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
    )
}

function buildBuyerDurationRow(orderId: string, prices: { d30: number; d60: number; d90: number }, disabled = false): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`renewal-buyer-30+${orderId}`)
            .setLabel(`🗓️ 30 Hari – ${formatRp(prices.d30)}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`renewal-buyer-60+${orderId}`)
            .setLabel(`🗓️ 60 Hari – ${formatRp(prices.d60)}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`renewal-buyer-90+${orderId}`)
            .setLabel(`🗓️ 90 Hari – ${formatRp(prices.d90)}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`renewal-buyer-decline+${orderId}`)
            .setLabel("❌ Tidak Mau")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
    )
}

// ── Step 1: Send admin notification (H-4 or buyer self-request) ───────────────

export async function sendAdminRenewalNotification(record: RenewalRecord): Promise<void> {
    if (!discordClient) return

    try {
        const channelId = getAdminChannelId(record.productId)
        if (!channelId) {
            PrettyLog.warn(`[Renewal] Tidak ada renewalChannelId atau logChannelId dikonfigurasi`)
            return
        }

        const guild   = await discordClient.guilds.fetch(record.guildId)
        const channel = await guild.channels.fetch(channelId)
        if (!channel || !channel.isTextBased()) return

        const expiryTs = Math.floor(new Date(record.warrantyExpiresAt).getTime() / 1000)

        const prices = {
            d30: calcPrice(record.productId, record.shopId, 30),
            d60: calcPrice(record.productId, record.shopId, 60),
            d90: calcPrice(record.productId, record.shopId, 90),
        }

        const roleMentions = getAdminRoleMentions(record.productId)

        const embed = new EmbedBuilder()
            .setTitle("🔔 Permintaan Renewal Garansi")
            .setDescription(
                `${record.isManual ? "⚙️ **Renewal Manual** — dipicu oleh admin\n\n" : ""}` +
                `👤 **User:** <@${record.userId}>\n` +
                `📦 **Produk:** ${record.productName}\n` +
                `🏪 **Toko:** ${record.shopName}\n` +
                `📝 **Order ID:** \`${record.orderId}\`\n` +
                `⏰ **Expired:** <t:${expiryTs}:F> (<t:${expiryTs}:R>)\n\n` +
                `**Opsi Harga Perpanjangan:**\n` +
                `🗓️ 30 Hari → ${formatRp(prices.d30)}\n` +
                `🗓️ 60 Hari → ${formatRp(prices.d60)}\n` +
                `🗓️ 90 Hari → ${formatRp(prices.d90)}\n\n` +
                `Klik tombol di bawah untuk setuju atau tolak permintaan ini.`
            )
            .setColor(Colors.Yellow)
            .setTimestamp()

        const row = buildAdminButtons(record.orderId)

        const message = await channel.send({
            content: roleMentions || undefined,
            embeds: [embed],
            components: [row],
        })

        updateRenewalRecord(record.orderId, {
            status:           "admin-notified",
            adminNotifiedAt:  new Date().toISOString(),
            adminChannelId:   channelId,
            adminMessageId:   message.id,
        })

        PrettyLog.info(`[Renewal] Admin notif dikirim untuk order ${record.orderId}`)
    } catch (error) {
        PrettyLog.error(`[Renewal] Gagal kirim admin notif: ${error}`)
    }
}

// ── Step 2a: Admin approves ───────────────────────────────────────────────────

export async function handleAdminApprove(interaction: ButtonInteraction, orderId: string): Promise<void> {
    // ── Authorization check ──
    const rolesSetting  = getSetting("renewalAdminRoles")
    const adminRoleIds  = rolesSetting?.value
        ? String(rolesSetting.value).split(",").map((r: string) => r.trim()).filter(Boolean)
        : []
    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null)
    const hasRole = adminRoleIds.length > 0 && (member?.roles.cache.some(r => adminRoleIds.includes(r.id)) ?? false)
    const hasAdmin = interaction.memberPermissions?.has("Administrator") ?? false
    const isAdmin = hasRole || hasAdmin
    if (!isAdmin) {
        await interaction.reply({ content: "❌ Hanya admin yang bisa menyetujui renewal.", ephemeral: true })
        return
    }

    const record = getRenewalRecord(orderId)
    if (!record || record.status !== "admin-notified") {
        await interaction.reply({
            content: "⚠️ Renewal ini sudah diproses atau tidak ditemukan.",
            ephemeral: true,
        })
        return
    }

    updateRenewalRecord(orderId, { status: "admin-approved" })

    const disabledRow = buildAdminButtons(orderId, true)
    await interaction.update({
        components: [disabledRow],
    })

    const updatedRecord = getRenewalRecord(orderId)!

    await sendBuyerDurationOffer(updatedRecord)
}

// ── Shared: disable admin Discord message (called from both button + dashboard) ──

export async function disableAdminRenewalMessage(record: RenewalRecord): Promise<void> {
    if (!discordClient || !record.adminChannelId || !record.adminMessageId) return
    try {
        const guild   = await discordClient.guilds.fetch(record.guildId)
        const channel = await guild.channels.fetch(record.adminChannelId)
        if (!channel || !channel.isTextBased()) return
        const message = await (channel as import("discord.js").TextChannel).messages.fetch(record.adminMessageId)
        const disabledRow = buildAdminButtons(record.orderId, true)
        await message.edit({ components: [disabledRow] })
    } catch {
        // Message may already be gone or permissions changed — silently ignore
    }
}

// ── Shared: DM buyer on rejection from dashboard ────────────────────────────

export async function sendRejectionDMFromDashboard(record: RenewalRecord): Promise<void> {
    if (!discordClient) return
    try {
        const user = await discordClient.users.fetch(record.userId)
        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("❌ Renewal Ditolak")
                    .setDescription(
                        `Maaf, permintaan renewal untuk produk **${record.productName}** ` +
                        `(Order: \`${record.orderId}\`) telah **ditolak** oleh admin.\n\n` +
                        `Silakan hubungi admin jika ada pertanyaan.`
                    )
                    .setColor(Colors.Red)
                    .setTimestamp(),
            ],
        })
    } catch {
        PrettyLog.warn(`[Renewal] Tidak bisa DM buyer ${record.userId} (dashboard reject)`)
    }
}

// ── Step 2b: Admin rejects ────────────────────────────────────────────────────

export async function handleAdminReject(interaction: ButtonInteraction, orderId: string): Promise<void> {
    // ── Authorization check ──
    const rolesSetting  = getSetting("renewalAdminRoles")
    const adminRoleIds  = rolesSetting?.value
        ? String(rolesSetting.value).split(",").map((r: string) => r.trim()).filter(Boolean)
        : []
    const member = await interaction.guild?.members.fetch(interaction.user.id).catch(() => null)
    const hasRole = adminRoleIds.length > 0 && (member?.roles.cache.some(r => adminRoleIds.includes(r.id)) ?? false)
    const hasAdmin = interaction.memberPermissions?.has("Administrator") ?? false
    const isAdmin = hasRole || hasAdmin
    if (!isAdmin) {
        await interaction.reply({ content: "❌ Hanya admin yang bisa menolak renewal.", ephemeral: true })
        return
    }

    const record = getRenewalRecord(orderId)
    if (!record || record.status !== "admin-notified") {
        await interaction.reply({
            content: "⚠️ Renewal ini sudah diproses atau tidak ditemukan.",
            ephemeral: true,
        })
        return
    }

    updateRenewalRecord(orderId, { status: "admin-rejected" })

    const disabledRow = buildAdminButtons(orderId, true)
    await interaction.update({
        components: [disabledRow],
        embeds: [
            new EmbedBuilder()
                .setTitle("❌ Renewal Ditolak")
                .setDescription(
                    `Admin telah **menolak** permintaan renewal untuk order \`${orderId}\`.\n\n` +
                    `📦 **Produk:** ${record.productName}\n` +
                    `👤 **User:** <@${record.userId}>`
                )
                .setColor(Colors.Red)
                .setTimestamp(),
        ],
    })

    if (!discordClient) return
    try {
        const user = await discordClient.users.fetch(record.userId)
        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("❌ Renewal Ditolak")
                    .setDescription(
                        `Maaf, permintaan renewal untuk produk **${record.productName}** ` +
                        `(Order: \`${orderId}\`) telah **ditolak** oleh admin.\n\n` +
                        `Silakan hubungi admin jika ada pertanyaan.`
                    )
                    .setColor(Colors.Red)
                    .setTimestamp(),
            ],
        })
    } catch {
        PrettyLog.warn(`[Renewal] Tidak bisa DM buyer ${record.userId} (rejected)`)
    }
}

// ── Step 3: Send buyer DM with duration buttons ───────────────────────────────

export async function sendBuyerDurationOffer(record: RenewalRecord): Promise<void> {
    if (!discordClient) return

    try {
        const user = await discordClient.users.fetch(record.userId)

        const expiryTs = Math.floor(new Date(record.warrantyExpiresAt).getTime() / 1000)
        const prices = {
            d30: calcPrice(record.productId, record.shopId, 30),
            d60: calcPrice(record.productId, record.shopId, 60),
            d90: calcPrice(record.productId, record.shopId, 90),
        }

        const embed = new EmbedBuilder()
            .setTitle("🔄 Tawaran Perpanjangan Garansi")
            .setDescription(
                `Hei <@${record.userId}>! Admin menyetujui perpanjangan garansi untuk:\n\n` +
                `📦 **Produk:** ${record.productName}\n` +
                `🏪 **Toko:** ${record.shopName}\n` +
                `📝 **Order ID:** \`${record.orderId}\`\n` +
                `⏰ **Expired saat ini:** <t:${expiryTs}:F>\n\n` +
                `Pilih durasi perpanjangan yang kamu inginkan di bawah ini.\n` +
                `Harga sudah termasuk biaya admin QRIS.`
            )
            .setColor(Colors.Blue)
            .setTimestamp()

        const row = buildBuyerDurationRow(record.orderId, prices)

        await user.send({ embeds: [embed], components: [row] })

        updateRenewalRecord(record.orderId, {
            status:          "buyer-notified",
            buyerNotifiedAt: new Date().toISOString(),
        })

        PrettyLog.info(`[Renewal] Buyer DM tawaran durasi dikirim ke ${record.userId} untuk order ${record.orderId}`)
    } catch (error) {
        PrettyLog.error(`[Renewal] Gagal kirim buyer DM: ${error}`)
    }
}

// ── Step 4a: Buyer declines ───────────────────────────────────────────────────

export async function handleBuyerDecline(interaction: ButtonInteraction, orderId: string): Promise<void> {
    const record = getRenewalRecord(orderId)
    if (!record || record.status !== "buyer-notified") {
        await interaction.update({ content: "⚠️ Tawaran ini sudah tidak berlaku.", components: [], embeds: [] })
        return
    }

    updateRenewalRecord(orderId, { status: "buyer-declined" })

    const disabledRow = buildBuyerDurationRow(orderId, { d30: 0, d60: 0, d90: 0 }, true)

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setTitle("❌ Renewal Dibatalkan")
                .setDescription(`Kamu memilih untuk tidak memperpanjang garansi order \`${orderId}\`.`)
                .setColor(Colors.Grey)
                .setTimestamp(),
        ],
        components: [disabledRow],
    })
}

// ── Step 4b: Buyer chooses duration → create QRIS ─────────────────────────────

export async function handleBuyerDurationChoice(
    interaction: ButtonInteraction,
    orderId: string,
    durationDays: 30 | 60 | 90
): Promise<void> {
    const record = getRenewalRecord(orderId)
    if (!record || record.status !== "buyer-notified") {
        await interaction.update({ content: "⚠️ Tawaran ini sudah tidak berlaku.", components: [], embeds: [] })
        return
    }

    await interaction.deferUpdate()

    try {
        const amount   = calcPrice(record.productId, record.shopId, durationDays)
        const rnwId    = renewalOrderId()
        const expiredAt = new Date(Date.now() + 15 * 60 * 1000)

        const payResult = await createQrisPayment(rnwId, amount)

        updateRenewalRecord(orderId, {
            status:           "payment-pending",
            durationDays,
            renewalOrderId:   rnwId,
            renewalAmount:    payResult.amount,   // base amount — matches webhook payload.amount
            paymentCreatedAt: new Date().toISOString(),
        })

        const expiredTs = Math.floor(expiredAt.getTime() / 1000)

        const { default: QRCode } = await import("qrcode")
        const qrBuffer = await QRCode.toBuffer(payResult.payment_number, {
            errorCorrectionLevel: "M",
            type: "png",
            margin: 2,
            width: 400,
        })
        const { AttachmentBuilder } = await import("discord.js")
        const qrAttachment = new AttachmentBuilder(qrBuffer, { name: "qris-renewal.png" })

        const disabledRow = buildBuyerDurationRow(orderId, { d30: 0, d60: 0, d90: 0 }, true)

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("💳 Invoice Renewal QRIS")
                    .setDescription(
                        `📦 **Produk:** ${record.productName}\n` +
                        `🗓️ **Durasi:** ${durationDays} Hari\n` +
                        `💰 **Total Bayar:** Rp ${payResult.total_payment.toLocaleString("id-ID")}\n` +
                        `📋 **Biaya Admin:** Rp ${payResult.fee.toLocaleString("id-ID")}\n` +
                        `⏰ **Expired:** <t:${expiredTs}:R>\n` +
                        `📝 **Renewal ID:** \`${rnwId}\`\n\n` +
                        `📱 Scan QR code di bawah untuk membayar.`
                    )
                    .setImage("attachment://qris-renewal.png")
                    .setColor(Colors.Gold)
                    .setTimestamp(),
            ],
            files: [qrAttachment],
            components: [disabledRow],
        })

        // Auto-expire timer (15 minutes)
        setTimeout(() => handleRenewalPaymentExpired(rnwId), 15 * 60 * 1000)

    } catch (error) {
        PrettyLog.error(`[Renewal] Gagal buat QRIS renewal: ${error}`)
        await interaction.editReply({
            content: "❌ Gagal membuat tagihan QRIS. Silakan coba lagi nanti.",
            components: [],
        }).catch(() => {})
    }
}

// ── Step 5: Renewal payment expired ──────────────────────────────────────────

async function handleRenewalPaymentExpired(renewalOrderId: string): Promise<void> {
    const record = getRenewalRecordByRenewalOrderId(renewalOrderId)
    if (!record || record.status !== "payment-pending") return

    updateRenewalRecord(record.orderId, { status: "buyer-notified" })

    PrettyLog.warn(`[Renewal] QRIS renewal ${renewalOrderId} expired tanpa dibayar, kembali ke buyer-notified`)
}

// ── Step 6: Renewal payment completed (from webhook) ─────────────────────────

export async function handleRenewalPaymentCompleted(renewalOrderId: string): Promise<boolean> {
    const record = getRenewalRecordByRenewalOrderId(renewalOrderId)
    if (!record) return false

    // ── Idempotency guard: only process payment-pending records ──
    if (record.status !== "payment-pending") {
        PrettyLog.warn(`[Renewal] Duplicate webhook ignored for ${renewalOrderId} (status: ${record.status})`)
        return true
    }

    if (!discordClient) return true

    const durationDays = record.durationDays ?? 30
    const submission   = getWarrantySubmission(record.orderId)

    let newExpiryStr: string
    if (submission?.warrantyExpiresAt) {
        newExpiryStr = expiryDateStr(submission.warrantyExpiresAt, durationDays)
    } else {
        // Base from current warrantyExpiresAt on the renewal record, or now
        newExpiryStr = expiryDateStr(record.warrantyExpiresAt ?? new Date().toISOString(), durationDays)
    }

    if (submission) {
        // Update existing submission
        saveWarrantySubmission({ ...submission, warrantyExpiresAt: newExpiryStr })
    } else {
        // Create a minimal warranty submission so the new expiry is persisted durably
        saveWarrantySubmission({
            orderId:           record.orderId,
            userId:            record.userId,
            productId:         record.productId,
            productName:       record.productName,
            shopName:          record.shopName,
            guildId:           record.guildId,
            submittedAt:       new Date().toISOString(),
            purchasedAt:       new Date().toISOString(),
            warrantyExpiresAt: newExpiryStr,
        })
    }

    updateRenewalRecord(record.orderId, {
        status:      "completed",
        completedAt: new Date().toISOString(),
        // cleanupAt: warrantyExpiresAt + 10 days (new expiry after this renewal)
        cleanupAt: new Date(new Date(newExpiryStr).getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    })

    const newExpiryTs = Math.floor(new Date(newExpiryStr).getTime() / 1000)

    try {
        const user = await discordClient.users.fetch(record.userId)
        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ Renewal Berhasil!")
                    .setDescription(
                        `Pembayaran renewal untuk produk **${record.productName}** berhasil!\n\n` +
                        `📝 **Order ID:** \`${record.orderId}\`\n` +
                        `🗓️ **Diperpanjang:** ${durationDays} hari\n` +
                        `🛡️ **Masa aktif baru:** <t:${newExpiryTs}:F> (<t:${newExpiryTs}:R>)\n\n` +
                        `Terima kasih sudah berlangganan! 🎉`
                    )
                    .setColor(Colors.Green)
                    .setTimestamp(),
            ],
        })
    } catch {
        PrettyLog.warn(`[Renewal] Tidak bisa DM buyer ${record.userId} (completed)`)
    }

    // Log to logChannelId (transaction log), NOT the renewal approval channel
    try {
        const logChSetting = getSetting("logChannelId")
        const logChannelId = logChSetting?.value && typeof logChSetting.value === "string"
            ? logChSetting.value
            : null
        if (logChannelId) {
            const guild   = await discordClient.guilds.fetch(record.guildId)
            const channel = await guild.channels.fetch(logChannelId)
            if (channel?.isTextBased()) {
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("✅ Renewal Lunas")
                            .setDescription(
                                `👤 **User:** <@${record.userId}>\n` +
                                `📦 **Produk:** ${record.productName}\n` +
                                `📝 **Order ID:** \`${record.orderId}\`\n` +
                                `🗓️ **Diperpanjang:** ${durationDays} hari\n` +
                                `🛡️ **Expired baru:** <t:${newExpiryTs}:F>\n` +
                                `💰 **Renewal ID:** \`${renewalOrderId}\``
                            )
                            .setColor(Colors.Green)
                            .setTimestamp(),
                    ],
                })
            }
        }
    } catch {
        PrettyLog.warn(`[Renewal] Tidak bisa log renewal completed ke channel`)
    }

    PrettyLog.success(`[Renewal] Order ${record.orderId} diperpanjang ${durationDays} hari, expired baru: ${newExpiryStr}`)
    return true
}

// ── H-2 buyer notification (admin no response) ────────────────────────────────

export async function sendBuyerNoResponseNotif(record: RenewalRecord): Promise<void> {
    if (!discordClient) return

    try {
        const user = await discordClient.users.fetch(record.userId)
        const expiryTs = Math.floor(new Date(record.warrantyExpiresAt).getTime() / 1000)

        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("⚠️ Garansi Segera Berakhir")
                    .setDescription(
                        `Hei! Garansi untuk produk **${record.productName}** (Order: \`${record.orderId}\`) ` +
                        `akan berakhir <t:${expiryTs}:R>.\n\n` +
                        `Sayangnya, permintaan perpanjangan tidak mendapat persetujuan admin.\n` +
                        `Silakan hubungi admin langsung jika ingin memperpanjang.`
                    )
                    .setColor(Colors.Orange)
                    .setTimestamp(),
            ],
        })
    } catch {
        PrettyLog.warn(`[Renewal] Tidak bisa DM buyer ${record.userId} (no-response)`)
    }

    // Always terminate to no-response regardless of DM success/failure
    // Prevents checker from spamming DM retries on every H-2 cycle
    updateRenewalRecord(record.orderId, { status: "no-response" })
}

// ── Register self-service request from /account ───────────────────────────────

export async function handleSelfServiceRenewalRequest(
    interaction: ButtonInteraction | MessageComponentInteraction,
    orderId: string
): Promise<void> {
    if (!discordClient) return

    const existing = getRenewalRecord(orderId)
    const terminal: string[] = ["completed", "buyer-declined", "admin-rejected", "no-response"]
    if (existing && !terminal.includes(existing.status)) {
        await interaction.reply({
            content: `⚠️ Permintaan renewal untuk order \`${orderId}\` sudah dalam proses (status: **${existing.status}**). Harap tunggu.`,
            ephemeral: true,
        })
        return
    }

    const submission = getWarrantySubmission(orderId)
    if (!submission || !submission.warrantyExpiresAt) {
        await interaction.reply({
            content: "❌ Order ini tidak memenuhi syarat renewal (belum registrasi garansi atau garansi tidak ada batas waktu).",
            ephemeral: true,
        })
        return
    }

    // ── Ownership guard: only the original buyer can request renewal ──
    if (submission.userId && submission.userId !== interaction.user.id) {
        await interaction.reply({
            content: "❌ Kamu bukan pemilik order ini.",
            ephemeral: true,
        })
        return
    }

    // ── Server-side dynamic eligibility: warranty must not be expired ──
    if (new Date(submission.warrantyExpiresAt).getTime() <= Date.now()) {
        await interaction.reply({
            content: "❌ Garansi untuk order ini sudah expired. Renewal tidak bisa dilakukan.",
            ephemeral: true,
        })
        return
    }

    // ── Server-side dynamic eligibility: no open claim ticket ──
    const tickets = getClaimTickets()
    const hasOpenClaim = Object.values(tickets).some(
        t => t.orderId === orderId && t.status === "open"
    )
    if (hasOpenClaim) {
        await interaction.reply({
            content: "❌ Kamu memiliki tiket komplain aktif untuk order ini. Tutup tiket terlebih dahulu sebelum renewal.",
            ephemeral: true,
        })
        return
    }

    if (!isRenewalEnabled(submission.productId)) {
        await interaction.reply({
            content: "❌ Produk ini tidak mengaktifkan fitur renewal.",
            ephemeral: true,
        })
        return
    }

    const history = getUserPurchaseHistory(submission.userId ?? interaction.user.id)
    const purchaseRecord = history.find(h => h.orderId === orderId)

    // Guard: shopId is required for calcPrice during renewal payment
    if (!purchaseRecord?.shopId) {
        await interaction.reply({
            content: "❌ Data pembelian tidak ditemukan. Hubungi admin untuk proses renewal manual.",
            ephemeral: true,
        })
        return
    }

    const record: RenewalRecord = {
        orderId,
        userId:            interaction.user.id,
        productId:         submission.productId,
        productName:       submission.productName,
        shopId:            purchaseRecord.shopId,
        shopName:          submission.shopName,
        guildId:           submission.guildId,
        warrantyExpiresAt: submission.warrantyExpiresAt,
        status:            "watching",
        isManual:          false,
        createdAt:         new Date().toISOString(),
    }

    saveRenewalRecord(record)
    await sendAdminRenewalNotification(record)

    await interaction.reply({
        content: `✅ Permintaan renewal untuk order \`${orderId}\` telah dikirim ke admin. Harap tunggu persetujuan.`,
        ephemeral: true,
    })
}

// ── Button interaction router ─────────────────────────────────────────────────

export async function handleRenewalButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
    const [prefix, orderId] = interaction.customId.split("+")

    if (!orderId) return false

    switch (prefix) {
        case "renewal-admin-approve":
            await handleAdminApprove(interaction, orderId)
            return true
        case "renewal-admin-reject":
            await handleAdminReject(interaction, orderId)
            return true
        case "renewal-buyer-30":
            await handleBuyerDurationChoice(interaction, orderId, 30)
            return true
        case "renewal-buyer-60":
            await handleBuyerDurationChoice(interaction, orderId, 60)
            return true
        case "renewal-buyer-90":
            await handleBuyerDurationChoice(interaction, orderId, 90)
            return true
        case "renewal-buyer-decline":
            await handleBuyerDecline(interaction, orderId)
            return true
        case "renewal-req":
            await handleSelfServiceRenewalRequest(interaction, orderId)
            return true
        default:
            return false
    }
}

// ── Hook into payment webhook ─────────────────────────────────────────────────

EVENTS.on("paymentCompleted", (orderId: string) => {
    if (!orderId.startsWith("RNW-")) return
    handleRenewalPaymentCompleted(orderId).catch(e => {
        PrettyLog.error(`[Renewal] Gagal proses renewal payment completed: ${e}`)
    })
})
