/* Developer: BANGDET.MD */
import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    Client,
    ChatInputCommandInteraction,
    EmbedBuilder,
    Colors,
    MessageFlags,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    StringSelectMenuInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ModalSubmitInteraction,
} from "discord.js"
import { getShops } from "@/features/shops/database/shops-database.js"
import { getProducts } from "@/features/shops/database/products-database.js"
import { getRenewalConfig, setRenewalConfig } from "@/features/renewal/renewal-database.js"
import { RenewalConfig } from "@/features/renewal/renewal-types.js"
import { PrettyLog } from "@/lib/pretty-log.js"

export const data = new SlashCommandBuilder()
    .setName("setup-renewal")
    .setDescription("Konfigurasi renewal otomatis per-produk (aktif, channel notif, roles ping)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

export async function execute(_client: Client, interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const shops = getShops()
    if (!shops.size) {
        await interaction.editReply({ content: "❌ Belum ada toko yang dibuat." })
        return
    }

    const DISCORD_MAX = 25
    const shopOptions: StringSelectMenuOptionBuilder[] = []
    let shopCount = 0
    shops.forEach(shop => {
        if (shopCount >= DISCORD_MAX) return
        shopOptions.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(`${shop.emoji ?? "🏪"} ${shop.name}`)
                .setValue(shop.id)
        )
        shopCount++
    })
    const shopTruncated = shops.size > DISCORD_MAX

    const shopSelect = new StringSelectMenuBuilder()
        .setCustomId("setup-renewal-shop")
        .setPlaceholder("Pilih toko...")
        .addOptions(shopOptions)

    const shopRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(shopSelect)

    const response = await interaction.editReply({
        embeds: [
            new EmbedBuilder()
                .setTitle("⚙️ Setup Renewal — Pilih Toko")
                .setDescription(
                    "Pilih toko untuk melihat daftar produk dan mengkonfigurasi renewal per-produk.\n\n" +
                    "Konfigurasi meliputi: **aktif**, **channel notifikasi**, dan **roles yang di-ping**." +
                    (shopTruncated ? `\n\n⚠️ Hanya **${DISCORD_MAX} dari ${shops.size}** toko yang ditampilkan (batas Discord). Gunakan dashboard untuk toko lainnya.` : "")
                )
                .setColor(Colors.Blue),
        ],
        components: [shopRow],
    })

    const collector = response.createMessageComponentCollector({
        time: 120_000,
        filter: i => i.user.id === interaction.user.id,
    })

    let selectedShopId = ""
    let selectedProductId = ""

    collector.on("collect", async (i) => {
        try {
            if (i.isStringSelectMenu() && i.customId === "setup-renewal-shop") {
                selectedShopId = (i as StringSelectMenuInteraction).values[0]
                const shop = shops.get(selectedShopId)
                if (!shop) return

                const [err, products] = getProducts(selectedShopId)
                if (err || !products || !products.size) {
                    await i.update({ content: "❌ Toko ini belum memiliki produk.", components: [], embeds: [] })
                    collector.stop()
                    return
                }

                const productOptions: StringSelectMenuOptionBuilder[] = []
                let productCount = 0
                products.forEach(product => {
                    if (productCount >= DISCORD_MAX) return
                    const config    = getRenewalConfig(product.id)
                    const statusStr = config?.enabled ? "✅ Aktif" : "❌ Nonaktif"
                    productOptions.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${product.name} [${statusStr}]`.substring(0, 100))
                            .setDescription(`Rp ${product.price.toLocaleString("id-ID")} — Klik untuk konfigurasi renewal`)
                            .setValue(product.id)
                    )
                    productCount++
                })
                const productsTruncated = products.size > DISCORD_MAX

                const productSelect = new StringSelectMenuBuilder()
                    .setCustomId("setup-renewal-product")
                    .setPlaceholder("Pilih produk untuk dikonfigurasi...")
                    .addOptions(productOptions)

                await i.update({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle(`⚙️ Setup Renewal — ${shop.name}`)
                            .setDescription(
                                "Pilih produk untuk mengkonfigurasi renewal (aktif/nonaktif, channel, roles)." +
                                (productsTruncated ? `\n\n⚠️ Hanya **${DISCORD_MAX} dari ${products.size}** produk ditampilkan. Gunakan dashboard untuk produk lainnya.` : "")
                            )
                            .setColor(Colors.Blue),
                    ],
                    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(productSelect)],
                })
            }

            else if (i.isStringSelectMenu() && i.customId === "setup-renewal-product") {
                selectedProductId = (i as StringSelectMenuInteraction).values[0]
                const [err, products] = getProducts(selectedShopId)
                if (err || !products) return

                const product = products.get(selectedProductId)
                if (!product) return

                const currentConfig = getRenewalConfig(selectedProductId)

                const modal = new ModalBuilder()
                    .setCustomId(`setup-renewal-modal+${selectedProductId}`)
                    .setTitle(`Setup Renewal: ${product.name.substring(0, 30)}`)

                const aktifInput = new TextInputBuilder()
                    .setCustomId("aktif")
                    .setLabel("Aktifkan renewal? (ya / tidak)")
                    .setStyle(TextInputStyle.Short)
                    .setValue(currentConfig?.enabled ? "ya" : "tidak")
                    .setRequired(true)
                    .setMinLength(2)
                    .setMaxLength(5)

                const channelInput = new TextInputBuilder()
                    .setCustomId("channelId")
                    .setLabel("Channel ID notifikasi (kosong = default global)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder("Contoh: 1234567890123456789")
                if (currentConfig?.notifyChannelId) channelInput.setValue(currentConfig.notifyChannelId)

                const rolesInput = new TextInputBuilder()
                    .setCustomId("roles")
                    .setLabel("Role IDs yang di-ping (pisah koma, kosong = default)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder("Contoh: 111111111,222222222")
                if (currentConfig?.notifyRoles) rolesInput.setValue(currentConfig.notifyRoles)

                modal.addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(aktifInput),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(channelInput),
                    new ActionRowBuilder<TextInputBuilder>().addComponents(rolesInput),
                )

                await i.showModal(modal)

                // Wait for modal submit
                const modalSubmit = await i.awaitModalSubmit({
                    filter: m => m.customId === `setup-renewal-modal+${selectedProductId}` && m.user.id === interaction.user.id,
                    time: 120_000,
                }).catch(() => null)

                if (!modalSubmit) return

                const aktifStr       = modalSubmit.fields.getTextInputValue("aktif").trim().toLowerCase()
                const channelIdInput = modalSubmit.fields.getTextInputValue("channelId").trim()
                const rolesInputVal  = modalSubmit.fields.getTextInputValue("roles").trim()

                if (!["ya", "tidak", "yes", "no"].includes(aktifStr)) {
                    await modalSubmit.reply({ content: "❌ Nilai aktif tidak valid. Ketik **ya** atau **tidak**.", ephemeral: true })
                    collector.stop()
                    return
                }

                const enabled = aktifStr === "ya" || aktifStr === "yes"

                const newConfig: RenewalConfig = {
                    enabled,
                    ...(channelIdInput ? { notifyChannelId: channelIdInput } : {}),
                    ...(rolesInputVal   ? { notifyRoles: rolesInputVal }      : {}),
                }

                setRenewalConfig(selectedProductId, newConfig)

                await modalSubmit.reply({ flags: MessageFlags.Ephemeral, content: `✅ Renewal dikonfigurasi untuk **${product.name}**:` })
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("✅ Renewal Diperbarui")
                            .setDescription(
                                `📦 **Produk:** ${product.name}\n` +
                                `🔄 **Renewal:** ${enabled ? "✅ Diaktifkan" : "❌ Dinonaktifkan"}\n` +
                                `📢 **Channel Notif:** ${channelIdInput ? `<#${channelIdInput}>` : "default global"}\n` +
                                `🎭 **Roles Ping:** ${rolesInputVal ? rolesInputVal.split(",").map(r => `<@&${r.trim()}>`).join(" ") : "default global"}\n\n` +
                                `Jalankan \`/setup-renewal\` lagi untuk mengatur produk lain.`
                            )
                            .setColor(enabled ? Colors.Green : Colors.Red),
                    ],
                    components: [],
                })

                PrettyLog.info(`[SetupRenewal] Produk ${product.name} (${selectedProductId}) dikonfigurasi: enabled=${enabled}`)
                collector.stop()
            }
        } catch (error) {
            PrettyLog.error(`[SetupRenewal] ${error}`)
        }
    })

    collector.on("end", (_c, reason) => {
        if (reason === "time") {
            interaction.editReply({ content: "⏰ Waktu habis. Jalankan `/setup-renewal` lagi.", components: [], embeds: [] }).catch(() => {})
        }
    })
}
