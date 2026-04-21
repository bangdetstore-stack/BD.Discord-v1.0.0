/* Developer: BANGDET.MD */
import {
    ButtonInteraction,
    StringSelectMenuInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelType,
    MessageFlags,
    ChatInputCommandInteraction,
} from "discord.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { getSetting } from "@/features/settings/database/settings-handler.js"
import {
    getPurchaseRecord,
    getUserPurchaseHistory,
    getWarrantySubmission,
    getClaimCountForOrder,
    addClaimTicket,
    getClaimTicketByThread,
    closeClaimTicketDb,
    saveWarrantySubmission,
    getWarrantySubmissionsByUser,
    getNextTicketNumber,
} from "./warranty-database.js"
import { ClaimTicket } from "./warranty-types.js"
import { nanoid } from "nanoid"

const MAX_CLAIMS = 3

// ── Validate claim for orderId + userId ───────────────────────────────────────
interface ClaimValidation {
    ok: boolean
    reason?: string
    submission?: import("./warranty-types.js").WarrantySubmission
}

function validateClaim(userId: string, orderId: string): ClaimValidation {
    const purchaseRecord = getPurchaseRecord(userId, orderId)
    if (!purchaseRecord) {
        return { ok: false, reason: "❌ **Tidak ada data transaksi** untuk order ini.\nPastikan kamu membeli produk ini melalui bot." }
    }

    const submission = getWarrantySubmission(orderId)
    if (!submission) {
        return { ok: false, reason: "❌ **Form garansi belum diisi** untuk order ini.\nIsi form garansi terlebih dahulu sebelum mengajukan komplain." }
    }

    const now     = Date.now()
    const expires = new Date(submission.warrantyExpiresAt).getTime()
    if (expires > 0 && now > expires) {
        const expiryTs = Math.floor(expires / 1000)
        return { ok: false, reason: `❌ **Masa garansi sudah habis** untuk order ini.\nGaransi berakhir pada <t:${expiryTs}:F>.` }
    }

    const claimCount = getClaimCountForOrder(orderId)
    if (claimCount >= MAX_CLAIMS) {
        return { ok: false, reason: `❌ **Batas klaim tercapai** (${MAX_CLAIMS}x) untuk order ini.\nTidak bisa mengajukan komplain lebih lanjut.` }
    }

    return { ok: true, submission }
}

// ── Handle "Ajukan Komplain" button (warranty-claim+{orderId}) ───────────────
export async function handleClaimButton(
    interaction: ButtonInteraction,
    orderId: string
): Promise<void> {
    const userId     = interaction.user.id
    const validation = validateClaim(userId, orderId)

    if (!validation.ok) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🚫 Komplain Ditolak")
                    .setDescription(validation.reason!)
                    .setColor(Colors.Red),
            ],
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    await openClaimTicket(interaction, orderId, validation.submission!)
}

// ── Handle /komplain command ──────────────────────────────────────────────────
export async function handleKomplainCommand(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    const userId      = interaction.user.id
    const submissions = getWarrantySubmissionsByUser(userId)

    if (!submissions.length) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🚫 Tidak Ada Data")
                    .setDescription("Kamu belum memiliki garansi yang terdaftar.\nBeli produk dan isi form garansi terlebih dahulu.")
                    .setColor(Colors.Red),
            ],
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    const now  = Date.now()
    const opts = submissions
        .filter(s => {
            if (!s.warrantyExpiresAt) return true  // no expiry configured → always valid
            const expires = new Date(s.warrantyExpiresAt).getTime()
            return isNaN(expires) || expires <= 0 || now <= expires
        })
        .slice(0, 25)

    if (!opts.length) {
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🚫 Garansi Habis")
                    .setDescription("Semua garansi kamu sudah habis masa berlakunya.")
                    .setColor(Colors.Red),
            ],
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId("claim-select-order")
        .setPlaceholder("📦 Pilih order untuk diklaim...")
        .addOptions(
            opts.map(s => {
                const claimCount = getClaimCountForOrder(s.orderId)
                const remaining  = MAX_CLAIMS - claimCount
                const expires    = new Date(s.warrantyExpiresAt).getTime()
                const expiryStr  = expires > 0
                    ? new Date(s.warrantyExpiresAt).toLocaleDateString("id-ID")
                    : "Tidak ada"

                return new StringSelectMenuOptionBuilder()
                    .setLabel(s.productName.slice(0, 100))
                    .setValue(s.orderId)
                    .setDescription(`Order: ${s.orderId} | Garansi s/d: ${expiryStr} | Sisa klaim: ${remaining}x`)
            })
        )

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("🎫 Ajukan Komplain Garansi")
                .setDescription("Pilih order yang ingin kamu komplain dari daftar di bawah.")
                .setColor(Colors.Blue),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
        flags: MessageFlags.Ephemeral,
    })
}

// ── Handle select menu from /komplain ────────────────────────────────────────
export async function handleClaimOrderSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    const orderId    = interaction.values[0]
    const userId     = interaction.user.id
    const validation = validateClaim(userId, orderId)

    if (!validation.ok) {
        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🚫 Komplain Ditolak")
                    .setDescription(validation.reason!)
                    .setColor(Colors.Red),
            ],
            components: [],
        })
        return
    }

    await openClaimTicketFromSelect(interaction, orderId, validation.submission!)
}

// ── Create claim ticket (private thread) ─────────────────────────────────────
async function openClaimTicket(
    interaction: ButtonInteraction,
    orderId: string,
    submission: import("./warranty-types.js").WarrantySubmission
): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const result = await createClaimThread(interaction.client, interaction.user.id, orderId, submission)
    if (!result.ok) {
        await interaction.editReply({ content: result.error })
        return
    }

    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setTitle("✅ Tiket Komplain Dibuat")
                .setDescription(
                    `Tiket komplain kamu telah dibuat!\n\n` +
                    `🎫 **Thread:** <#${result.threadId}>\n` +
                    `📦 **Produk:** ${submission.productName}\n` +
                    `📝 **Order:** \`${orderId}\`\n\n` +
                    `Tim admin akan segera membantu kamu.`
                )
                .setColor(Colors.Green),
        ],
    })
}

async function openClaimTicketFromSelect(
    interaction: StringSelectMenuInteraction,
    orderId: string,
    submission: import("./warranty-types.js").WarrantySubmission
): Promise<void> {
    await interaction.deferUpdate()

    const result = await createClaimThread(interaction.client, interaction.user.id, orderId, submission)
    if (!result.ok) {
        await interaction.editReply({ content: result.error, components: [], embeds: [] })
        return
    }

    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setTitle("✅ Tiket Komplain Dibuat")
                .setDescription(
                    `Tiket komplain kamu telah dibuat!\n\n` +
                    `🎫 **Thread:** <#${result.threadId}>\n` +
                    `📦 **Produk:** ${submission.productName}\n` +
                    `📝 **Order:** \`${orderId}\`\n\n` +
                    `Tim admin akan segera membantu kamu.`
                )
                .setColor(Colors.Green),
        ],
        components: [],
    })
}

interface CreateThreadResult {
    ok: boolean
    threadId?: string
    error?: string
}

async function createClaimThread(
    client: import("discord.js").Client,
    userId: string,
    orderId: string,
    submission: import("./warranty-types.js").WarrantySubmission
): Promise<CreateThreadResult> {
    // Defense-in-depth: ensure claimant owns this submission
    if (submission.userId !== userId) {
        return { ok: false, error: "❌ Kamu tidak memiliki akses ke order ini." }
    }

    const claimChSetting = getSetting("claimChannelId")
    if (!claimChSetting?.value) {
        return { ok: false, error: "❌ Channel komplain belum dikonfigurasi. Hubungi admin." }
    }

    const rolesSetting = getSetting("claimAdminRoles")
    const adminRoles   = rolesSetting?.value
        ? String(rolesSetting.value).split(",").map(r => r.trim()).filter(Boolean)
        : []

    try {
        const guild   = await client.guilds.fetch(submission.guildId)
        const channel = await guild.channels.fetch(claimChSetting.value as string)

        if (!channel || !channel.isTextBased()) {
            return { ok: false, error: "❌ Channel komplain tidak valid atau bukan text channel. Hubungi admin." }
        }

        if (!("threads" in channel)) {
            return { ok: false, error: "❌ Channel komplain tidak mendukung thread. Gunakan text channel biasa." }
        }

        const ticketId    = nanoid(10)
        const ticketNum   = String(getNextTicketNumber()).padStart(3, "0")

        // Fetch member display name (fall back to userId tail on error)
        let displayName = userId.slice(-6)
        try {
            const member = await guild.members.fetch(userId)
            displayName  = member.displayName ?? member.user.username ?? displayName
        } catch { /* member not in guild, use fallback */ }

        // Trim displayName so full thread name fits within 100 chars
        // Format: "🎫 DisplayName (orderId) - NNN"  (emoji = 2 bytes but Discord counts chars)
        const maxNameLen = 80 - orderId.length
        const safeName   = displayName.length > maxNameLen
            ? displayName.slice(0, maxNameLen - 1) + "…"
            : displayName

        // Cast to TextChannel for PrivateThread creation (Discord.js typings require it)
        const textChannel = channel as import("discord.js").TextChannel
        const thread = await textChannel.threads.create({
            name:                `🎫 ${safeName} (${orderId}) - ${ticketNum}`,
            type:                ChannelType.PrivateThread,
            invitable:           false,
            autoArchiveDuration: 10080,
            reason:              `Tiket komplain ${orderId}`,
        })

        // Explicitly add claimant to private thread so they can access it
        await thread.members.add(userId)

        const expiryTs = Math.floor(new Date(submission.warrantyExpiresAt).getTime() / 1000)
        const claimNum = getClaimCountForOrder(orderId) + 1

        const roleTagStr = adminRoles.length > 0
            ? adminRoles.map(r => `<@&${r}>`).join(" ") + "\n"
            : ""

        const openingMsg = await thread.send({
            content: `${roleTagStr}<@${userId}>`,
            embeds: [
                new EmbedBuilder()
                    .setTitle(`🎫 Tiket Komplain #${claimNum}`)
                    .setDescription(
                        `Halo <@${userId}>! Tiket komplain kamu telah dibuat.\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `📦 **Produk:** ${submission.productName}\n` +
                        `🏪 **Toko:** ${submission.shopName}\n` +
                        `📝 **Order:** \`${orderId}\`\n` +
                        `🛡️ **Garansi s/d:** <t:${expiryTs}:F>\n` +
                        `🔢 **Klaim ke:** ${claimNum} / ${MAX_CLAIMS}\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n\n` +
                        `Jelaskan masalah yang kamu alami. Tim admin akan membantu segera.\n` +
                        `Gunakan \`/tutupticket\` untuk menutup tiket setelah masalah selesai.`
                    )
                    .setColor(Colors.Blue)
                    .setTimestamp()
                    .setFooter({ text: `Ticket ID: ${ticketId}` }),
            ],
        })

        void openingMsg

        const ticket: ClaimTicket = {
            ticketId,
            orderId,
            userId,
            productName:  submission.productName,
            shopName:     submission.shopName,
            threadId:     thread.id,
            channelId:    channel.id,
            guildId:      submission.guildId,
            status:       "open",
            createdAt:    new Date().toISOString(),
        }

        addClaimTicket(ticket)
        PrettyLog.success(`[Claim] Tiket ${ticketId} dibuat untuk order ${orderId} oleh ${userId}`)

        return { ok: true, threadId: thread.id }
    } catch (e) {
        PrettyLog.error(`[Claim] Gagal buat thread: ${e}`)
        return { ok: false, error: "❌ Gagal membuat thread tiket. Pastikan bot punya izin membuat private thread." }
    }
}

// ── /tutupticket — close ticket ───────────────────────────────────────────────
export async function handleTutupticketCommand(
    interaction: ChatInputCommandInteraction
): Promise<void> {
    const channel = interaction.channel
    if (!channel || channel.type !== ChannelType.PrivateThread) {
        await interaction.reply({
            content: "❌ Command ini hanya bisa digunakan di dalam thread tiket komplain.",
            flags:   MessageFlags.Ephemeral,
        })
        return
    }

    const ticket = getClaimTicketByThread(channel.id)
    if (!ticket) {
        await interaction.reply({
            content: "❌ Thread ini bukan tiket komplain yang valid.",
            flags:   MessageFlags.Ephemeral,
        })
        return
    }

    if (ticket.status === "closed") {
        await interaction.reply({
            content: "⚠️ Tiket ini sudah ditutup sebelumnya.",
            flags:   MessageFlags.Ephemeral,
        })
        return
    }

    const userId = interaction.user.id
    const member = await interaction.guild?.members.fetch(userId).catch(() => null)
    const rolesSetting = getSetting("claimAdminRoles")
    const adminRoles   = rolesSetting?.value
        ? String(rolesSetting.value).split(",").map(r => r.trim()).filter(Boolean)
        : []

    const isTicketOwner = ticket.userId === userId
    const isAdmin = member?.roles.cache.some(r => adminRoles.includes(r.id)) ?? false

    if (!isTicketOwner && !isAdmin) {
        await interaction.reply({
            content: "❌ Hanya pemilik tiket atau admin yang bisa menutup tiket ini.",
            flags:   MessageFlags.Ephemeral,
        })
        return
    }

    await interaction.deferReply()

    const closedAt      = new Date()
    const createdAt     = new Date(ticket.createdAt)
    const claimDurationMs = closedAt.getTime() - createdAt.getTime()
    const claimDurationH  = claimDurationMs / (1000 * 60 * 60)

    closeClaimTicketDb(ticket.ticketId)

    // ── Warranty time compensation (claim > 24h) ──────────────────────────────
    let compensationMsg = ""
    if (claimDurationH > 24) {
        const submission = getWarrantySubmission(ticket.orderId)
        if (submission?.warrantyExpiresAt) {
            const oldExpiry  = new Date(submission.warrantyExpiresAt)
            const newExpiry  = new Date(oldExpiry.getTime() + claimDurationMs)
            saveWarrantySubmission({ ...submission, warrantyExpiresAt: newExpiry.toISOString() })

            const newExpiryTs = Math.floor(newExpiry.getTime() / 1000)
            compensationMsg = `\n\n🛡️ **Kompensasi:** Masa aktif garansi diperpanjang ${Math.floor(claimDurationH)} jam (durasi klaim). Expired baru: <t:${newExpiryTs}:F>`

            // Notify buyer
            try {
                const buyer = await interaction.client.users.fetch(ticket.userId)
                await buyer.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("🛡️ Garansi Diperpanjang")
                            .setDescription(
                                `Tiket komplain kamu untuk **${ticket.productName}** telah ditutup.\n\n` +
                                `Karena durasi klaim melebihi 24 jam (${Math.floor(claimDurationH)} jam), ` +
                                `masa aktif garansimu otomatis diperpanjang.\n\n` +
                                `🛡️ **Expired baru:** <t:${newExpiryTs}:F> (<t:${newExpiryTs}:R>)`
                            )
                            .setColor(Colors.Green)
                            .setTimestamp(),
                    ],
                })
            } catch {
                PrettyLog.warn(`[Claim] Tidak bisa DM buyer untuk kompensasi garansi`)
            }
        }
    }

    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setTitle("🔒 Tiket Ditutup")
                .setDescription(
                    `Tiket komplain ini telah ditutup oleh <@${userId}>.\n\n` +
                    `📦 **Produk:** ${ticket.productName}\n` +
                    `📝 **Order:** \`${ticket.orderId}\`\n` +
                    `🕐 **Ditutup:** <t:${Math.floor(closedAt.getTime() / 1000)}:F>` +
                    compensationMsg
                )
                .setColor(Colors.Grey)
                .setTimestamp(),
        ],
    })

    try {
        await (channel as import("discord.js").ThreadChannel).setArchived(true, "Tiket ditutup")
    } catch (e) {
        PrettyLog.warn(`[Claim] Tidak bisa archive thread: ${e}`)
    }

    await logClaimClose(interaction.client, ticket, userId)
    PrettyLog.success(`[Claim] Tiket ${ticket.ticketId} ditutup oleh ${userId}`)
}

// ── Log tiket close ke warranty log channel ───────────────────────────────────
async function logClaimClose(
    client: import("discord.js").Client,
    ticket: ClaimTicket,
    closedByUserId: string
): Promise<void> {
    try {
        const setting = getSetting("warrantyLogChannelId")
        if (!setting?.value) return

        const guild   = await client.guilds.fetch(ticket.guildId)
        const channel = await guild.channels.fetch(setting.value as string)
        if (!channel || !channel.isTextBased()) return

        await channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🔒 Tiket Komplain Ditutup")
                    .setDescription(
                        `👤 **User:** <@${ticket.userId}>\n` +
                        `👮 **Ditutup oleh:** <@${closedByUserId}>\n` +
                        `📦 **Produk:** ${ticket.productName}\n` +
                        `🏪 **Toko:** ${ticket.shopName}\n` +
                        `📝 **Order:** \`${ticket.orderId}\`\n` +
                        `🎫 **Ticket ID:** \`${ticket.ticketId}\``
                    )
                    .setColor(Colors.Grey)
                    .setTimestamp(),
            ],
        })
    } catch (e) {
        PrettyLog.warn(`[Claim] Tidak bisa log close: ${e}`)
    }
}
