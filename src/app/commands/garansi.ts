/* Developer: BANGDET.MD */
import {
    ChatInputCommandInteraction,
    Client,
    SlashCommandBuilder,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
} from "discord.js"
import {
    getPendingWarranties,
    getWarrantySubmissionsByUser,
    getUserPurchaseHistory,
} from "@/features/warranty/warranty-database.js"
import { buildWarrantyButton } from "@/features/warranty/warranty-flow.js"

export const data = new SlashCommandBuilder()
    .setName("garansi")
    .setDescription("Lihat status garansi kamu dan isi form garansi yang belum diisi")

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id

    const pendingWarranties = Object.values(getPendingWarranties()).filter(w => w.userId === userId)
    const submissions       = getWarrantySubmissionsByUser(userId)
    const purchaseHistory   = getUserPurchaseHistory(userId)

    const now = Date.now()

    const embed = new EmbedBuilder()
        .setTitle("🛡️ Status Garansi Kamu")
        .setColor(Colors.Blue)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: "BangDet Store" })

    const fields: { name: string; value: string; inline: boolean }[] = []

    if (pendingWarranties.length > 0) {
        embed.setColor(Colors.Yellow)
        let pendingText = ""
        for (const w of pendingWarranties) {
            const purchasedTs = Math.floor(new Date(w.purchasedAt).getTime() / 1000)
            pendingText += `📦 **${w.productName}**\n> Order: \`${w.orderId}\`\n> Dibeli: <t:${purchasedTs}:R>\n\n`
        }
        fields.push({
            name: "⏳ Form Belum Diisi",
            value: (pendingText.trim() || "—") + "\n\nKlik tombol di bawah untuk mengisi form garansi.",
            inline: false,
        })
    }

    if (submissions.length > 0) {
        let submittedText = ""
        for (const s of submissions) {
            if (!s.warrantyExpiresAt) {
                submittedText += `✅ **${s.productName}**\n> Order: \`${s.orderId}\`\n> ♾️ Garansi tidak berbatas waktu\n\n`
            } else {
                const expiryTs = Math.floor(new Date(s.warrantyExpiresAt).getTime() / 1000)
                const isExpired = new Date(s.warrantyExpiresAt).getTime() < now
                const icon = isExpired ? "❌" : "🛡️"
                const label = isExpired ? "Garansi sudah berakhir" : `Aktif hingga <t:${expiryTs}:D> (<t:${expiryTs}:R>)`
                submittedText += `${icon} **${s.productName}**\n> Order: \`${s.orderId}\`\n> ${label}\n\n`
            }
        }
        fields.push({
            name: "📋 Garansi Terdaftar",
            value: submittedText.trim() || "—",
            inline: false,
        })
    }

    const noWarrantyOrders = purchaseHistory.filter(
        r => !pendingWarranties.some(pw => pw.orderId === r.orderId) &&
             !submissions.some(s => s.orderId === r.orderId)
    )
    if (noWarrantyOrders.length > 0) {
        let noFormText = ""
        for (const r of noWarrantyOrders) {
            noFormText += `• **${r.productName}** — \`${r.orderId}\`\n`
        }
        fields.push({
            name: "ℹ️ Produk Tanpa Garansi",
            value: noFormText.trim(),
            inline: false,
        })
    }

    if (fields.length === 0) {
        embed
            .setDescription("Kamu belum memiliki riwayat pembelian produk dengan garansi.\n\nBeli produk dari toko untuk mulai!")
            .setColor(Colors.Greyple)
    } else {
        embed.setDescription(
            pendingWarranties.length > 0
                ? `Kamu memiliki **${pendingWarranties.length}** form garansi yang belum diisi!\nSegera isi sebelum waktu habis.`
                : `Berikut adalah status garansi kamu.`
        )
        embed.setFields(fields)
    }

    if (pendingWarranties.length === 0) {
        await interaction.reply({ embeds: [embed], ephemeral: true })
        return
    }

    const rows: ActionRowBuilder<ButtonBuilder>[] = []
    for (let i = 0; i < Math.min(pendingWarranties.length, 5); i++) {
        const w   = pendingWarranties[i]!
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            buildWarrantyButton(w.orderId)
                .setLabel(`📋 Isi Garansi: ${w.productName.substring(0, 40)}`)
        )
        rows.push(row)
    }

    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true })
}
