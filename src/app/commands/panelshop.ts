/* Developer: BANGDET.MD */
import {
    SlashCommandBuilder,
    Client,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ModalSubmitInteraction,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags,
    ChannelType,
} from "discord.js"
import { getShops } from "@/features/shops/database/shops-database.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { registerPanel, linkSetupPanel, buildSetupEmbed, buildSetupRows } from "@/features/shops/panel-registry.js"

export const data = new SlashCommandBuilder()
    .setName("panelshop")
    .setDescription("Buat panel toko di channel yang dipilih")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
        option
            .setName("channel")
            .setDescription("Channel tempat panel shop akan dikirim")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
    )

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    const shops = getShops()

    if (!shops.size) {
        await interaction.reply({
            content: "❌ Belum ada toko yang tersedia. Buat toko terlebih dahulu dengan `/shops-manage`.",
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    const targetChannel = interaction.options.getChannel("channel", true)

    // Show modal for initial embed config
    const modal = new ModalBuilder()
        .setCustomId("panelshop-modal")
        .setTitle("Konfigurasi Panel Toko")

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("panel-title")
                .setLabel("Judul Embed")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("contoh: 🛍️ DIERA STORE - LIST PRODUK")
                .setRequired(true)
                .setMaxLength(256)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("panel-description")
                .setLabel("Deskripsi Embed")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("contoh: Silakan pilih kategori produk di bawah ini.")
                .setRequired(true)
                .setMaxLength(4000)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("panel-color")
                .setLabel("Warna Sidebar (Hex Code)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("contoh: #FF5733  (kosongkan untuk default emas)")
                .setRequired(false)
                .setMaxLength(7)
        ),
    )

    await interaction.showModal(modal)

    let modalSubmit: ModalSubmitInteraction
    try {
        modalSubmit = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === "panelshop-modal" && i.user.id === interaction.user.id,
            time: 300_000,
        })
    } catch {
        return
    }

    await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral })

    const title       = modalSubmit.fields.getTextInputValue("panel-title").trim()
    const description = modalSubmit.fields.getTextInputValue("panel-description").trim()
    const colorRaw    = modalSubmit.fields.getTextInputValue("panel-color").trim()

    let color: number = 0xFFD700
    if (colorRaw) {
        const parsed = parseInt(colorRaw.replace("#", ""), 16)
        if (!isNaN(parsed)) color = parsed
    }

    // ─── Build Shop Panel (sent to target channel) ───────────────────────────
    const shopList = Array.from(shops.values()).slice(0, 25)

    const shopSelectMenu = new StringSelectMenuBuilder()
        .setCustomId("panelshop-select-shop")
        .setPlaceholder("🛍️ Pilih Kategori Toko...")
        .addOptions(
            shopList.map(shop =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${shop.emoji ? shop.emoji + " " : ""}${shop.name}`)
                    .setDescription(shop.description.length > 100 ? shop.description.slice(0, 97) + "..." : shop.description)
                    .setValue(shop.id)
            )
        )

    const shopRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(shopSelectMenu)

    const shopPanelEmbed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: "Pilih kategori toko di bawah untuk melihat produk" })
        .setTimestamp()

    // ─── Send to target channel ──────────────────────────────────────────────
    const shopChannel = interaction.guild?.channels.cache.get(targetChannel.id)
        ?? await interaction.guild?.channels.fetch(targetChannel.id).catch(() => null)

    if (!shopChannel || !shopChannel.isTextBased()) {
        await modalSubmit.editReply({ content: "❌ Channel tujuan tidak valid atau bot tidak punya akses." })
        return
    }

    try {
        const shopMessage = await shopChannel.send({
            embeds:     [shopPanelEmbed],
            components: [shopRow],
        })

        // Register panel in DB
        const panel = await registerPanel({
            messageId:   shopMessage.id,
            channelId:   shopChannel.id,
            guildId:     interaction.guildId!,
            title,
            description,
            color,
        })

        // ─── Send Setup Panel (in current channel, where admin ran command) ──
        const setupChannel = interaction.channel
            ?? await interaction.guild?.channels.fetch(interaction.channelId).catch(() => null)

        if (setupChannel && setupChannel.isTextBased()) {
            const sendableChannel = setupChannel as import("discord.js").TextChannel
            const setupMessage = await sendableChannel.send({
                embeds:     [buildSetupEmbed(panel)],
                components: buildSetupRows(panel.id),
            })

            await linkSetupPanel(panel.id, setupMessage.id, setupChannel.id)
        }

        await modalSubmit.editReply({
            content:
                `✅ **Panel shop berhasil dibuat** di <#${shopChannel.id}>!\n\n` +
                `⚙️ Panel setup sudah dikirim di channel ini — gunakan tombol-tombol di panel setup untuk mengubah judul, deskripsi, atau warna kapan saja.`,
        })

        PrettyLog.info(`[PanelShop] Panel created by ${interaction.user.username}: shop→#${shopChannel.id}, setup→#${interaction.channelId}`)
    } catch (error) {
        PrettyLog.error(`[PanelShop] Failed to send panel: ${error}`)
        await modalSubmit.editReply({
            content: `❌ Gagal membuat panel: \`${error}\``,
        })
    }
}
