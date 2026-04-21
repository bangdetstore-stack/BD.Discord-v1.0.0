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
import { setSticky, clearSticky, getStickyForChannel, updateStickyMessageId } from "@/features/sticky/sticky-handler.js"
import { PrettyLog } from "@/lib/pretty-log.js"

export const data = new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Kelola sticky message di channel ini (pesan yang selalu muncul di paling bawah)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
        .setName("set")
        .setDescription("Pasang sticky message di channel ini")
        .addStringOption(opt => opt
            .setName("pesan")
            .setDescription("Isi sticky message (boleh pakai markdown Discord)")
            .setRequired(true)
            .setMaxLength(2000)
        )
    )
    .addSubcommand(sub => sub
        .setName("clear")
        .setDescription("Hapus sticky message di channel ini")
    )
    .addSubcommand(sub => sub
        .setName("info")
        .setDescription("Lihat isi sticky message yang aktif di channel ini")
    )

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    const sub       = interaction.options.getSubcommand()
    const channelId = interaction.channelId

    if (sub === "set") {
        const content = interaction.options.getString("pesan", true)
        setSticky(channelId, content)

        // Hapus sticky lama & kirim sticky baru pertama kali
        try {
            const ch = interaction.channel
            if (!ch || !ch.isTextBased() || ch.isDMBased()) throw new Error("Channel tidak valid")

            const existing = getStickyForChannel(channelId)
            if (existing?.messageId) {
                try {
                    const old = await ch.messages.fetch(existing.messageId)
                    await old.delete()
                } catch { /* sudah terhapus */ }
                updateStickyMessageId(channelId, null)
            }
            const sent = await ch.send(content)
            updateStickyMessageId(channelId, sent.id)
            PrettyLog.info(`[Sticky] Sticky dipasang di channel ${channelId} oleh ${interaction.user.username}`)
        } catch (e) {
            PrettyLog.error(`[Sticky] Gagal kirim sticky awal: ${e}`)
        }

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("📌 Sticky Message Dipasang")
                    .setDescription(`Sticky message sudah aktif di channel ini.\nSetiap ada pesan baru, sticky akan muncul kembali di bawah.`)
                    .addFields({ name: "Isi Pesan", value: content.length > 1024 ? content.slice(0, 1021) + "..." : content })
                    .setColor(Colors.Green)
            ],
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    if (sub === "clear") {
        const existing = getStickyForChannel(channelId)
        if (!existing) {
            await interaction.reply({
                content: "❌ Tidak ada sticky message aktif di channel ini.",
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        // Hapus pesan sticky bot
        if (existing.messageId) {
            try {
                const old = await interaction.channel?.messages.fetch(existing.messageId)
                await old?.delete()
            } catch { /* sudah terhapus */ }
        }
        clearSticky(channelId)
        PrettyLog.info(`[Sticky] Sticky dihapus dari channel ${channelId} oleh ${interaction.user.username}`)

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("🗑️ Sticky Message Dihapus")
                    .setDescription("Sticky message di channel ini sudah dihapus.")
                    .setColor(Colors.Red)
            ],
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    if (sub === "info") {
        const existing = getStickyForChannel(channelId)
        if (!existing) {
            await interaction.reply({
                content: "ℹ️ Tidak ada sticky message aktif di channel ini.",
                flags: MessageFlags.Ephemeral,
            })
            return
        }
        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("📌 Sticky Message Aktif")
                    .addFields({ name: "Isi Pesan", value: existing.content.length > 1024 ? existing.content.slice(0, 1021) + "..." : existing.content })
                    .setColor(Colors.Blue)
            ],
            flags: MessageFlags.Ephemeral,
        })
    }
}
