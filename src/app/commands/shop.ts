/* Developer: BANGDET.MD */
import {
    SlashCommandBuilder,
    Client,
    ChatInputCommandInteraction,
    EmbedBuilder,
    Colors,
    MessageFlags,
} from "discord.js"
import { getPanelsForGuild } from "@/features/shops/panel-registry.js"

export const data = new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Informasi cara belanja di toko ini")

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    const guildId  = interaction.guildId
    const panels   = guildId ? getPanelsForGuild(guildId) : []

    if (panels.length > 0) {
        const links = panels
            .map(p => `> 🛍️ <#${p.channelId}>`)
            .join("\n")

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🛒 Cara Belanja di BangDet Store")
                    .setDescription(
                        `Semua transaksi dilakukan melalui **Panel Toko** yang tersedia di channel berikut:\n\n` +
                        `${links}\n\n` +
                        `**Cara Order:**\n` +
                        `1️⃣ Buka channel panel toko di atas\n` +
                        `2️⃣ Pilih kategori toko dari dropdown\n` +
                        `3️⃣ Pilih produk & klik tombol **Beli**\n` +
                        `4️⃣ Scan QR Code QRIS yang dikirim ke **DM** kamu\n` +
                        `5️⃣ Produk otomatis dikirim setelah pembayaran terkonfirmasi ✅\n\n` +
                        `Setelah beli, gunakan \`/garansi\` untuk mengaktifkan garansi produkmu.`
                    )
                    .setColor(Colors.Gold)
                    .setFooter({ text: "BangDet Store • Pembayaran via QRIS otomatis" })
            ],
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    // Fallback: panel belum dibuat admin
    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("🛒 BangDet Store")
                .setDescription(
                    `Panel toko belum tersedia saat ini.\n\n` +
                    `Silakan hubungi admin atau cek channel toko di server ini.`
                )
                .setColor(Colors.Orange)
        ],
        flags: MessageFlags.Ephemeral,
    })
}
