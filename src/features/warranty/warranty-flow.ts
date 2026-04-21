/* Developer: BANGDET.MD */
import {
    Client,
    ButtonInteraction,
    ModalSubmitInteraction,
    Message,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} from "discord.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import {
    getProductForm,
    addPendingWarranty,
    getPendingWarranty,
    markReminderSent,
    removePendingWarranty,
    saveWarrantySubmission,
    getPendingWarranties,
    getPendingScreenshot,
    setPendingScreenshot,
    removePendingScreenshot,
    type PartialSubmission,
} from "./warranty-database.js"
import { PendingWarranty, WarrantySubmission } from "./warranty-types.js"
import { getSetting } from "@/features/settings/database/settings-handler.js"

let discordClient: Client | null = null

export function setWarrantyClient(client: Client): void {
    discordClient = client
}

// ── Build warranty button (used in delivery DM) ────────────────────────────────
export function buildWarrantyButton(orderId: string): ButtonBuilder {
    return new ButtonBuilder()
        .setCustomId(`warranty-fill+${orderId}`)
        .setLabel("Isi Form Garansi")
        .setEmoji("📋")
        .setStyle(ButtonStyle.Primary)
}

// ── Build complaint button (used in delivery DM) ──────────────────────────────
export function buildComplaintButton(orderId: string): ButtonBuilder {
    return new ButtonBuilder()
        .setCustomId(`warranty-claim+${orderId}`)
        .setLabel("Ajukan Komplain")
        .setEmoji("🎫")
        .setStyle(ButtonStyle.Danger)
}

// ── Start warranty for order (called after successful delivery) ───────────────
export function startWarrantyForOrder(warranty: PendingWarranty): void {
    addPendingWarranty(warranty)
    scheduleWarrantyTimers(warranty)
}

const DEFAULT_REGISTRATION_HOURS = 24

// ── Schedule reminder + expiry ─────────────────────────────────────────────────
function scheduleWarrantyTimers(warranty: PendingWarranty): void {
    const regHours = warranty.registrationHours ?? DEFAULT_REGISTRATION_HOURS
    const reminderFraction = regHours / 8

    const purchasedAt = new Date(warranty.purchasedAt).getTime()
    const now         = Date.now()
    const reminderAt  = purchasedAt + reminderFraction * 60 * 60 * 1000
    const expiryAt    = purchasedAt + regHours * 60 * 60 * 1000

    if (!warranty.reminderSent) {
        const reminderDelay = reminderAt - now
        if (reminderDelay > 0) {
            setTimeout(() => sendWarrantyReminder(warranty), reminderDelay)
        } else {
            void sendWarrantyReminder(warranty)
        }
    }

    const expiryDelay = expiryAt - now
    if (expiryDelay > 0) {
        setTimeout(() => handleWarrantyExpired(warranty), expiryDelay)
    } else {
        handleWarrantyExpired(warranty)
    }
}

// ── Restore timers on bot restart ─────────────────────────────────────────────
export function restoreWarrantyTimers(): void {
    const pending = getPendingWarranties()
    const count   = Object.keys(pending).length
    if (!count) return

    PrettyLog.info(`[Warranty] Restoring ${count} pending warranty timer(s)`)
    for (const warranty of Object.values(pending)) {
        scheduleWarrantyTimers(warranty)
    }
}

// ── Reminder ───────────────────────────────────────────────────────────────────
async function sendWarrantyReminder(warranty: PendingWarranty): Promise<void> {
    if (!discordClient) return

    const current = getPendingWarranty(warranty.orderId)
    if (!current) return

    markReminderSent(warranty.orderId)

    const regHours = warranty.registrationHours ?? DEFAULT_REGISTRATION_HOURS

    try {
        const user = await discordClient.users.fetch(warranty.userId)

        const expiryAt = new Date(warranty.purchasedAt).getTime() + regHours * 60 * 60 * 1000
        const expiryTs = Math.floor(expiryAt / 1000)

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            buildWarrantyButton(warranty.orderId)
        )

        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("⏰ Pengingat Form Garansi")
                    .setDescription(
                        `Hei! Kamu belum mengisi form garansi untuk:\n` +
                        `📦 **${warranty.productName}** (Order: \`${warranty.orderId}\`)\n\n` +
                        `⚠️ Garansi akan **hangus** <t:${expiryTs}:R>.\n` +
                        `Isi sekarang agar garansimu tetap aktif!`
                    )
                    .setColor(Colors.Yellow)
                    .setTimestamp(),
            ],
            components: [row],
        })
    } catch (e) {
        PrettyLog.warn(`[Warranty] Tidak bisa kirim reminder ke ${warranty.userId}: ${e}`)
    }
}

// ── Expiry ────────────────────────────────────────────────────────────────────
async function handleWarrantyExpired(warranty: PendingWarranty): Promise<void> {
    const current = getPendingWarranty(warranty.orderId)
    if (!current) return

    removePendingWarranty(warranty.orderId)

    if (!discordClient) return

    try {
        const user = await discordClient.users.fetch(warranty.userId)
        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("❌ Garansi Hangus")
                    .setDescription(
                        `Masa pengisian form garansi untuk:\n` +
                        `📦 **${warranty.productName}** (Order: \`${warranty.orderId}\`)\n\n` +
                        `telah berakhir. Garansi tidak lagi berlaku.\n\n` +
                        `Jika ada masalah, hubungi admin.`
                    )
                    .setColor(Colors.Red)
                    .setTimestamp(),
            ],
        })
    } catch (e) {
        PrettyLog.warn(`[Warranty] Tidak bisa kirim expiry notice ke ${warranty.userId}: ${e}`)
    }

    await logToWarrantyChannel({
        type:        "expired",
        userId:      warranty.userId,
        productName: warranty.productName,
        orderId:     warranty.orderId,
        shopName:    warranty.shopName,
        guildId:     warranty.guildId,
    })
}

// ── Handle "Isi Form Garansi" button click ────────────────────────────────────
export async function handleWarrantyFillButton(
    interaction: ButtonInteraction,
    orderId: string
): Promise<void> {
    const warranty = getPendingWarranty(orderId)
    if (!warranty) {
        await interaction.reply({
            content: "❌ Form garansi sudah diisi, kedaluwarsa, atau tidak ditemukan.",
            flags:   MessageFlags.Ephemeral,
        })
        return
    }

    const formConfig = getProductForm(warranty.productId)
    if (!formConfig || !formConfig.enabled) {
        await interaction.reply({
            content: "❌ Form garansi tidak aktif untuk produk ini.",
            flags:   MessageFlags.Ephemeral,
        })
        return
    }

    const fields: TextInputBuilder[] = []

    if (formConfig.field1Label) {
        fields.push(
            new TextInputBuilder()
                .setCustomId("wf1")
                .setLabel(formConfig.field1Label.slice(0, 45))
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(200)
        )
    }
    if (formConfig.field2Label) {
        fields.push(
            new TextInputBuilder()
                .setCustomId("wf2")
                .setLabel(formConfig.field2Label.slice(0, 45))
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(200)
        )
    }
    if (!fields.length) {
        await interaction.reply({
            content: "❌ Form garansi tidak memiliki field yang aktif.",
            flags:   MessageFlags.Ephemeral,
        })
        return
    }

    const modal = new ModalBuilder()
        .setCustomId(`warranty-modal+${orderId}`)
        .setTitle("📋 Form Garansi")

    for (const field of fields) {
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field))
    }

    await interaction.showModal(modal)
}

// ── Handle modal submit ────────────────────────────────────────────────────────
export async function handleWarrantyModalSubmit(
    interaction: ModalSubmitInteraction,
    orderId: string
): Promise<void> {
    const warranty = getPendingWarranty(orderId)
    if (!warranty) {
        await interaction.reply({ content: "❌ Form garansi sudah tidak berlaku.", flags: MessageFlags.Ephemeral })
        return
    }

    const formConfig = getProductForm(warranty.productId)
    if (!formConfig || !formConfig.enabled) {
        await interaction.reply({ content: "❌ Form garansi tidak aktif.", flags: MessageFlags.Ephemeral })
        return
    }

    let field1: string | undefined
    let field2: string | undefined
    try { field1 = interaction.fields.getTextInputValue("wf1") || undefined } catch { field1 = undefined }
    if (formConfig.field2Label) {
        try { field2 = interaction.fields.getTextInputValue("wf2") || undefined } catch { field2 = undefined }
    }

    if (formConfig.requireScreenshot) {
        setPendingScreenshot(interaction.user.id, { orderId, field1, field2 })

        setTimeout(() => {
            if (getPendingScreenshot(interaction.user.id)?.orderId === orderId) {
                removePendingScreenshot(interaction.user.id)
                interaction.user.send(
                    `⏰ **Waktu pengiriman screenshot habis** untuk order \`${orderId}\`.\n` +
                    `Data form yang kamu isi tadi tidak tersimpan.\n\n` +
                    `Gunakan \`/garansi\` untuk mengisi form garansi lagi.`
                ).catch(() => {})
            }
        }, 15 * 60 * 1000)

        await interaction.reply({
            content:
                "✅ Data terisi! Sekarang kirim **screenshot bukti login** kamu di sini (DM ini).\n" +
                "⏳ Timeout: 15 menit.",
        })
    } else {
        await completeWarranty(interaction, warranty, { orderId, field1, field2 }, null)
    }
}

// ── Handle screenshot DM message ──────────────────────────────────────────────
export async function handleScreenshotDm(message: Message): Promise<void> {
    const pending = getPendingScreenshot(message.author.id)
    if (!pending) return

    const attachment = message.attachments.first()
    if (!attachment) return

    const warranty = getPendingWarranty(pending.orderId)
    if (!warranty) {
        removePendingScreenshot(message.author.id)
        return
    }

    removePendingScreenshot(message.author.id)

    await completeWarranty(null, warranty, pending, attachment.url)

    await message.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("✅ Garansi Aktif!")
                .setDescription(
                    `Screenshot berhasil diterima.\n\n` +
                    `🛡️ Garansi untuk **${warranty.productName}** sekarang **aktif**.\n` +
                    `📝 Order: \`${warranty.orderId}\``
                )
                .setColor(Colors.Green)
                .setTimestamp(),
        ],
    })
}

// ── Complete warranty submission ───────────────────────────────────────────────
async function completeWarranty(
    interaction: ModalSubmitInteraction | null,
    warranty: PendingWarranty,
    fields: PartialSubmission,
    screenshotUrl: string | null
): Promise<void> {
    const current = getPendingWarranty(warranty.orderId)
    if (!current) return

    const formConfig  = getProductForm(warranty.productId)
    const warrantyDays = formConfig?.warrantyDays ?? 0

    const purchasedAt = warranty.purchasedAt
    // warrantyDays === 0 means "no expiry" — use empty string so validation lets it through
    const warrantyExpiresAt = warrantyDays > 0
        ? new Date(new Date(purchasedAt).getTime() + warrantyDays * 24 * 60 * 60 * 1000).toISOString()
        : ""

    const submission: WarrantySubmission = {
        orderId:          warranty.orderId,
        userId:           warranty.userId,
        productId:        warranty.productId,
        productName:      warranty.productName,
        shopName:         warranty.shopName,
        submittedAt:      new Date().toISOString(),
        purchasedAt,
        warrantyExpiresAt,
        guildId:          warranty.guildId,
        field1:           fields.field1,
        field2:           fields.field2,
        screenshotUrl:    screenshotUrl ?? undefined,
    }

    saveWarrantySubmission(submission)
    removePendingWarranty(warranty.orderId)

    if (interaction) {
        const expiryTs = warrantyExpiresAt ? Math.floor(new Date(warrantyExpiresAt).getTime() / 1000) : 0
        const expiryLine = warrantyDays > 0 && expiryTs > 0
            ? `\n🛡️ **Garansi berlaku hingga:** <t:${expiryTs}:F>`
            : `\n♾️ **Garansi:** Tidak ada batas waktu`

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ Garansi Aktif!")
                    .setDescription(
                        `🛡️ Garansi untuk **${warranty.productName}** sekarang **aktif**.\n` +
                        `📝 Order: \`${warranty.orderId}\`` +
                        expiryLine
                    )
                    .setColor(Colors.Green)
                    .setTimestamp(),
            ],
        })
    }

    await logToWarrantyChannel({
        type:          "submitted",
        userId:        warranty.userId,
        productName:   warranty.productName,
        orderId:       warranty.orderId,
        shopName:      warranty.shopName,
        guildId:       warranty.guildId,
        submission,
    })
}

// ── Log to warranty channel ───────────────────────────────────────────────────
interface WarrantyLogPayload {
    type: "submitted" | "expired"
    userId: string
    productName: string
    orderId: string
    shopName: string
    guildId: string
    submission?: WarrantySubmission
}

async function logToWarrantyChannel(payload: WarrantyLogPayload): Promise<void> {
    if (!discordClient) return

    try {
        const setting = getSetting("warrantyLogChannelId")
        if (!setting?.value) return

        const guild   = await discordClient.guilds.fetch(payload.guildId)
        const channel = await guild.channels.fetch(setting.value as string)
        if (!channel || !channel.isTextBased()) return

        let embed: EmbedBuilder

        if (payload.type === "submitted" && payload.submission) {
            const s = payload.submission
            const formConfig = getProductForm(s.productId)

            let fieldsText = ""
            if (formConfig?.field1Label && s.field1) fieldsText += `**${formConfig.field1Label}:** ${s.field1}\n`
            if (formConfig?.field2Label && s.field2) fieldsText += `**${formConfig.field2Label}:** ${s.field2}\n`
            if (s.screenshotUrl)                     fieldsText += `**Screenshot:** [Lihat](<${s.screenshotUrl}>)\n`

            const expiryTs = Math.floor(new Date(s.warrantyExpiresAt).getTime() / 1000)
            const warrantyDays = formConfig?.warrantyDays ?? 0

            embed = new EmbedBuilder()
                .setTitle("🛡️ Form Garansi Terisi")
                .setDescription(
                    `👤 <@${payload.userId}>\n` +
                    `📦 **Produk:** ${payload.productName}\n` +
                    `🏪 **Toko:** ${payload.shopName}\n` +
                    `📝 **Order:** \`${payload.orderId}\`\n` +
                    (warrantyDays > 0 ? `🛡️ **Garansi hingga:** <t:${expiryTs}:F>\n` : "") +
                    `\n` +
                    (fieldsText || "*(tidak ada field)*")
                )
                .setColor(Colors.Green)
                .setTimestamp()
        } else {
            embed = new EmbedBuilder()
                .setTitle("❌ Garansi Hangus")
                .setDescription(
                    `👤 <@${payload.userId}>\n` +
                    `📦 **Produk:** ${payload.productName}\n` +
                    `🏪 **Toko:** ${payload.shopName}\n` +
                    `📝 **Order:** \`${payload.orderId}\`\n\n` +
                    `Form tidak diisi dalam waktu yang ditentukan.`
                )
                .setColor(Colors.Red)
                .setTimestamp()
        }

        await channel.send({ embeds: [embed] })
    } catch (e) {
        PrettyLog.warn(`[Warranty] Tidak bisa log ke warranty channel: ${e}`)
    }
}
