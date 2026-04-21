/* Developer: BANGDET.MD */
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    Client,
    ChatInputCommandInteraction,
    EmbedBuilder,
    Colors,
    MessageFlags,
} from "discord.js"
import { getWarrantySubmission, getUserPurchaseHistory, saveWarrantySubmission } from "@/features/warranty/warranty-database.js"
import { getRenewalRecord, saveRenewalRecord } from "@/features/renewal/renewal-database.js"
import { sendAdminRenewalNotification, sendBuyerDurationOffer } from "@/features/renewal/renewal-flow.js"
import { RenewalRecord } from "@/features/renewal/renewal-types.js"
import { PrettyLog } from "@/lib/pretty-log.js"

export const data = new SlashCommandBuilder()
    .setName("renewal-manual")
    .setDescription("Trigger renewal manual untuk order (admin only, termasuk yang belum daftar garansi)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt => opt
        .setName("user")
        .setDescription("User yang akan di-renewal")
        .setRequired(true)
    )
    .addStringOption(opt => opt
        .setName("orderid")
        .setDescription("Order ID yang akan di-renewal")
        .setRequired(true)
    )
    .addStringOption(opt => opt
        .setName("expired")
        .setDescription("Tanggal expired baru (DD/MM/YYYY) — kosongkan untuk skip set tanggal, langsung kirim tawaran")
        .setRequired(false)
    )

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const targetUser  = interaction.options.getUser("user", true)
    const orderId     = interaction.options.getString("orderid", true).trim()
    const expiredStr  = interaction.options.getString("expired", false)?.trim()

    // ── Validate orderId ──
    const existing = getRenewalRecord(orderId)
    const activeStatuses = ["watching", "admin-notified", "admin-approved", "buyer-notified", "payment-pending"]
    if (existing && activeStatuses.includes(existing.status)) {
        await interaction.editReply({
            content: `⚠️ Order \`${orderId}\` sudah memiliki renewal aktif (status: **${existing.status}**).`,
        })
        return
    }

    // ── Try to get existing warranty submission ──
    let submission = getWarrantySubmission(orderId)

    // ── Handle manual expiry override ──
    let manualExpiryStr: string | null = null
    if (expiredStr) {
        const parts = expiredStr.split("/")
        if (parts.length !== 3) {
            await interaction.editReply({ content: "❌ Format tanggal tidak valid. Gunakan DD/MM/YYYY." })
            return
        }

        const [dayStr, monthStr, yearStr] = parts
        const day   = parseInt(dayStr,   10)
        const month = parseInt(monthStr, 10) - 1
        const year  = parseInt(yearStr,  10)

        if (isNaN(day) || isNaN(month) || isNaN(year)) {
            await interaction.editReply({ content: "❌ Tanggal tidak valid." })
            return
        }

        const newExpiry = new Date(year, month, day, 23, 59, 59)
        if (isNaN(newExpiry.getTime()) ||
            newExpiry.getFullYear() !== parseInt(yearStr, 10) ||
            newExpiry.getMonth() !== parseInt(monthStr, 10) - 1 ||
            newExpiry.getDate() !== parseInt(dayStr, 10)) {
            await interaction.editReply({ content: "❌ Tanggal tidak valid (misalnya 31/02 tidak ada)." })
            return
        }

        manualExpiryStr = newExpiry.toISOString()

        // Update existing warranty submission if available
        if (submission) {
            saveWarrantySubmission({ ...submission, warrantyExpiresAt: manualExpiryStr })
            submission = getWarrantySubmission(orderId)
        }
    }

    // ── Build renewal record ──
    const history   = getUserPurchaseHistory(targetUser.id)
    const purchase  = history.find(h => h.orderId === orderId)

    // Priority: manual expiry > existing submission expiry > fallback 30 days from now
    const warrantyExpiresAt = manualExpiryStr
        ?? submission?.warrantyExpiresAt
        ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const productId = submission?.productId ?? purchase?.productId
    const shopId    = purchase?.shopId

    // Validate that we can map to a known product & shop so calcPrice won't return Rp 0
    if (!productId || !shopId) {
        await interaction.editReply({
            content:
                "❌ Tidak bisa menemukan data produk atau toko untuk order ini.\n" +
                "Pastikan user pernah membeli lewat bot (ada purchase history) atau sudah registrasi garansi.",
        })
        return
    }

    const record: RenewalRecord = {
        orderId,
        userId:            targetUser.id,
        productId,
        productName:       submission?.productName ?? purchase?.productName ?? "Produk Tidak Diketahui",
        shopId,
        shopName:          submission?.shopName ?? purchase?.shopName ?? "Toko Tidak Diketahui",
        guildId:           interaction.guildId ?? "",
        warrantyExpiresAt,
        status:            "admin-approved",
        isManual:          true,
        createdAt:         new Date().toISOString(),
    }

    saveRenewalRecord(record)

    // For manual renewal, bypass H-4 and go straight to buyer DM (admin already approved by running this command)
    await sendBuyerDurationOffer(record)

    const expiryTs = Math.floor(new Date(warrantyExpiresAt).getTime() / 1000)

    await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setTitle("✅ Renewal Manual Dikirim")
                .setDescription(
                    `Tawaran renewal telah dikirim ke <@${targetUser.id}>.\n\n` +
                    `📝 **Order ID:** \`${orderId}\`\n` +
                    `📦 **Produk:** ${record.productName}\n` +
                    `⏰ **Expired:** <t:${expiryTs}:F>\n\n` +
                    `Buyer akan menerima DM dengan pilihan durasi perpanjangan.`
                )
                .setColor(Colors.Green)
                .setTimestamp(),
        ],
    })

    PrettyLog.info(`[Renewal] Manual renewal dipicu oleh ${interaction.user.tag} untuk order ${orderId} (user: ${targetUser.id})`)
}
