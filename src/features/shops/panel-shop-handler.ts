/* Developer: BANGDET.MD */
import {
    StringSelectMenuInteraction,
    ButtonInteraction,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    Colors,
    bold,
} from "discord.js"
import { getShops } from "./database/shops-database.js"
import { getProductName } from "./database/products-database.js"
import { getCurrencyName } from "@/features/currencies/database/currencies-database.js"
import { startPaymentFlow } from "@/features/payment/payment-flow.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { Shop } from "./database/shops-types.js"
import { Product } from "./database/products-types.js"

/**
 * Handle when user selects a shop from the panel dropdown
 * customId: panelshop-select-shop
 */
export async function handlePanelShopSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const shopId = interaction.values[0]
    const shops = getShops()
    const shop = shops.get(shopId)

    if (!shop) {
        await interaction.reply({
            content: "❌ Toko tidak ditemukan.",
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    if (!shop.products.size) {
        await interaction.reply({
            content: `❌ Toko **${shop.name}** belum memiliki produk.`,
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    // Build product embed
    const productEmbed = buildProductListEmbed(shop)

    // Build product select dropdown (max 25)
    const productList = Array.from(shop.products.values()).slice(0, 25)

    const productSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`panelshop-select-product+${shopId}`)
        .setPlaceholder("📦 Pilih Produk...")
        .addOptions(
            productList.map((product) => {
                const stockLabel = product.amount !== undefined
                    ? product.amount > 0 ? ` [Stok: ${product.amount}]` : " [HABIS]"
                    : ""

                const label = `${product.emoji ? product.emoji + " " : ""}${product.name}${stockLabel}`
                const truncatedLabel = label.length > 100 ? label.slice(0, 97) + "..." : label
                const desc = `Rp ${product.price.toLocaleString("id-ID")}`

                return new StringSelectMenuOptionBuilder()
                    .setLabel(truncatedLabel)
                    .setDescription(desc)
                    .setValue(product.id)
            })
        )

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(productSelectMenu)

    await interaction.reply({
        embeds: [productEmbed],
        components: [row],
        flags: MessageFlags.Ephemeral,
    })
}

/**
 * Handle when user selects a product from the product dropdown
 * customId: panelshop-select-product+{shopId}
 */
export async function handlePanelProductSelect(interaction: StringSelectMenuInteraction, shopId: string): Promise<void> {
    const productId = interaction.values[0]
    const shops = getShops()
    const shop = shops.get(shopId)

    if (!shop) {
        await interaction.update({
            content: "❌ Toko tidak ditemukan.",
            embeds: [],
            components: [],
        })
        return
    }

    const product = shop.products.get(productId)
    if (!product) {
        await interaction.update({
            content: "❌ Produk tidak ditemukan.",
            embeds: [],
            components: [],
        })
        return
    }

    // Build product detail embed
    const detailEmbed = buildProductDetailEmbed(shop, product)

    // Build action buttons
    const buyButton = new ButtonBuilder()
        .setCustomId(`panelshop-buy+${shopId}+${productId}`)
        .setLabel("💳 Beli dengan QRIS")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(product.amount !== undefined && product.amount <= 0)

    const backButton = new ButtonBuilder()
        .setCustomId(`panelshop-back-to-products+${shopId}`)
        .setLabel("◀ Kembali ke Daftar Produk")
        .setStyle(ButtonStyle.Secondary)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buyButton, backButton)

    await interaction.update({
        embeds: [detailEmbed],
        components: [row],
    })
}

/**
 * Handle buy button click from panel
 * customId: panelshop-buy+{shopId}+{productId}
 */
export async function handlePanelBuy(interaction: ButtonInteraction, shopId: string, productId: string): Promise<void> {
    const shops = getShops()
    const shop = shops.get(shopId)

    if (!shop) {
        await interaction.reply({
            content: "❌ Toko tidak ditemukan.",
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    const product = shop.products.get(productId)
    if (!product) {
        await interaction.reply({
            content: "❌ Produk tidak ditemukan.",
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    // Defer update the current message to remove buttons (prevent double click)
    try {
        await interaction.update({
            content: "⏳ Memproses pembayaran...",
            embeds: [],
            components: [],
        })
    } catch (e) {
        PrettyLog.warn(`[PanelShop] Could not update message before payment: ${e}`)
    }

    // Trigger payment flow — create a fake ButtonInteraction-compatible wrapper
    // Since we already called update(), we use followUp for payment
    await startPaymentFromPanel(interaction, shop, product)
}

/**
 * Handle "back to products" button
 * customId: panelshop-back-to-products+{shopId}
 */
export async function handlePanelBackToProducts(interaction: ButtonInteraction, shopId: string): Promise<void> {
    const shops = getShops()
    const shop = shops.get(shopId)

    if (!shop) {
        await interaction.update({
            content: "❌ Toko tidak ditemukan.",
            embeds: [],
            components: [],
        })
        return
    }

    const productEmbed = buildProductListEmbed(shop)
    const productList = Array.from(shop.products.values()).slice(0, 25)

    const productSelectMenu = new StringSelectMenuBuilder()
        .setCustomId(`panelshop-select-product+${shopId}`)
        .setPlaceholder("📦 Pilih Produk...")
        .addOptions(
            productList.map((product) => {
                const stockLabel = product.amount !== undefined
                    ? product.amount > 0 ? ` [Stok: ${product.amount}]` : " [HABIS]"
                    : ""

                const label = `${product.emoji ? product.emoji + " " : ""}${product.name}${stockLabel}`
                const truncatedLabel = label.length > 100 ? label.slice(0, 97) + "..." : label
                const desc = `Rp ${product.price.toLocaleString("id-ID")}`

                return new StringSelectMenuOptionBuilder()
                    .setLabel(truncatedLabel)
                    .setDescription(desc)
                    .setValue(product.id)
            })
        )

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(productSelectMenu)

    await interaction.update({
        embeds: [productEmbed],
        components: [row],
    })
}

// ====== CUSTOM DISCORD EMOJIS ======
const EMOJI = {
    readyStok: "<a:ready_stok:1043552426306842717>",
    noStok:    "<a:no_stok:1059731297506955294>",
    unlimited: "♾️",
}

const SHOP_EMOJIS: { keyword: string; emoji: string }[] = [
    { keyword: "netflix", emoji: "<:netflixdet:1042305922208366662>" },
    { keyword: "canva",   emoji: "<:canvadet:1082488921386127381>" },
    { keyword: "viu",     emoji: "<:viudet:1088140110882689155>" },
    { keyword: "capcut",  emoji: "<:capcut:1371779470347735205>" },
]

function getShopEmoji(shopName: string): string | null {
    const lower = shopName.toLowerCase()
    for (const { keyword, emoji } of SHOP_EMOJIS) {
        if (lower.includes(keyword)) return emoji
    }
    return null
}

// ====== BRAND COLOR MAP (by shop name keyword) ======
const BRAND_COLORS: { keyword: string; color: number }[] = [
    { keyword: "netflix",       color: 0xE50914 },
    { keyword: "youtube",       color: 0xFF0000 },
    { keyword: "capcut",        color: 0x1A1A2E },
    { keyword: "chatgpt",       color: 0x10A37F },
    { keyword: "gemini",        color: 0x4285F4 },
    { keyword: "apple music",   color: 0xFC3C44 },
    { keyword: "viu",           color: 0xF5A623 },
    { keyword: "canva",         color: 0x00C4CC },
    { keyword: "alight motion", color: 0x7B2FF7 },
    { keyword: "prime video",   color: 0x00A8E1 },
    { keyword: "primevideo",    color: 0x00A8E1 },
    { keyword: "vision+",       color: 0x0D47A1 },
    { keyword: "scribd",        color: 0xE8A026 },
    { keyword: "zoom",          color: 0x2D8CFF },
    { keyword: "vidio",         color: 0x0099E6 },
    { keyword: "disney+",       color: 0x113CCF },
    { keyword: "disney",        color: 0x113CCF },
    { keyword: "wetv",          color: 0xC62B2B },
    { keyword: "vsco",          color: 0x3D3D3D },
    { keyword: "iqiyi",         color: 0x00BE06 },
    { keyword: "hbo",           color: 0x9B59B6 },
    { keyword: "youku",         color: 0x00B3FF },
    { keyword: "spotify",       color: 0x1DB954 },
    { keyword: "tiktok",        color: 0x010101 },
    { keyword: "duolingo",      color: 0x58CC02 },
    { keyword: "adobe",         color: 0xFF0000 },
]

function getBrandColor(shopName: string): number {
    const lower = shopName.toLowerCase()
    for (const { keyword, color } of BRAND_COLORS) {
        if (lower.includes(keyword)) return color
    }
    return 0xFFD700 // default gold
}

// ====== HELPER: Build product list embed ======
function buildProductListEmbed(shop: Shop): EmbedBuilder {
    const customShopEmoji = getShopEmoji(shop.name)
    const fallbackEmoji   = shop.emoji ? shop.emoji + " " : ""
    const shopName        = `${customShopEmoji ? customShopEmoji + " " : fallbackEmoji}${shop.name}`
    const brandColor      = getBrandColor(shop.name)
    const products        = Array.from(shop.products.values())

    const fields = products.slice(0, 24).map((product) => {
        const isOutOfStock = product.amount !== undefined && product.amount <= 0
        const isUnlimited  = product.amount === undefined

        const stockIcon = isUnlimited ? EMOJI.unlimited : isOutOfStock ? EMOJI.noStok : EMOJI.readyStok
        const stockText = isUnlimited ? "Unlimited" : isOutOfStock ? "Habis" : `${product.amount} Ready`
        const harga     = `Rp${product.price.toLocaleString("id-ID")}`

        const fieldName = isOutOfStock
            ? `~~${product.name}~~`
            : product.name

        const fieldValue = `💸 \`${harga}\`\n${stockIcon} \`${stockText}\``

        return { name: fieldName.length > 50 ? fieldName.slice(0, 47) + "..." : fieldName, value: fieldValue, inline: true }
    })

    // Pad to complete the last row cleanly (max 3 per row)
    while (fields.length % 3 !== 0) {
        fields.push({ name: "\u200b", value: "\u200b", inline: true })
    }

    const availableCount  = products.filter(p => p.amount === undefined || p.amount > 0).length
    const outOfStockCount = products.filter(p => p.amount !== undefined && p.amount <= 0).length

    return new EmbedBuilder()
        .setTitle(shopName)
        .setDescription(`> ${shop.description}\n\u200b`)
        .setColor(brandColor)
        .setFields(fields)
        .setFooter({
            text: `${products.length} produk  •  ${availableCount} tersedia  •  ${outOfStockCount} habis`
        })
        .setTimestamp()
}

// ====== HELPER: Build product detail embed ======
function buildProductDetailEmbed(shop: Shop, product: Product): EmbedBuilder {
    const shopName  = `${shop.emoji ? shop.emoji + " " : ""}${shop.name}`
    const brandColor = getBrandColor(shop.name)

    const isOutOfStock = product.amount !== undefined && product.amount <= 0
    const isUnlimited  = product.amount === undefined

    const stockValue = isUnlimited
        ? `${EMOJI.unlimited} Unlimited`
        : isOutOfStock
            ? `${EMOJI.noStok} STOK HABIS`
            : `${EMOJI.readyStok} ${product.amount} tersisa`

    const priceFormatted = `Rp ${product.price.toLocaleString("id-ID")}`

    return new EmbedBuilder()
        .setTitle(`📦 ${product.name}`)
        .setDescription(
            `🏪 **Toko:** ${bold(shopName)}\n\n` +
            `${product.description || "_Tidak ada deskripsi._"}`
        )
        .setColor(isOutOfStock ? 0xED4245 : brandColor)
        .addFields(
            {
                name: "💰 Harga",
                value: `\`\`\`\n${priceFormatted}\n\`\`\``,
                inline: true,
            },
            {
                name: "📦 Status Stok",
                value: stockValue,
                inline: true,
            },
            {
                name: "\u200b",
                value: "\u200b",
                inline: true,
            },
        )
        .setFooter({
            text: isOutOfStock
                ? "❌ Produk ini sedang habis stok"
                : "✅ Klik tombol di bawah untuk membeli dengan QRIS",
        })
        .setTimestamp()
}

// ====== Payment from panel (uses followUp since update() already called) ======
async function startPaymentFromPanel(interaction: ButtonInteraction, shop: Shop, product: Product): Promise<void> {
    try {
        const { createQrisPayment } = await import("@/features/payment/service/pakasir-service.js")
        const {
            addPendingPayment,
            getPaymentByUserId,
            getPendingPayment,
            updatePendingPaymentStatus,
            removePendingPayment,
        } = await import("@/features/payment/database/payment-store.js")
        const { getProductName } = await import("./database/products-database.js")
        const { getShopName }    = await import("./database/shops-database.js")
        const { ActivityLog }    = await import("@/lib/activity-log.js")
        const QRCode  = (await import("qrcode")).default
        const { nanoid } = await import("nanoid")
        const {
            EmbedBuilder,
            Colors,
            AttachmentBuilder,
            bold,
            ActionRowBuilder,
            ButtonBuilder,
            ButtonStyle,
        } = await import("discord.js")

        // Cek payment pending yang sudah ada
        const existingPayment = getPaymentByUserId(interaction.user.id)
        if (existingPayment) {
            await interaction.followUp({
                content: `❌ Kamu masih memiliki transaksi yang belum selesai (Order: ${bold(existingPayment.orderId)}). Selesaikan atau batalkan terlebih dahulu.`,
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        // Cek stok
        if (product.amount !== undefined && product.amount <= 0) {
            await interaction.followUp({
                content: `❌ Produk **${getProductName(shop.id, product.id)}** sudah habis!`,
                flags: MessageFlags.Ephemeral,
            })
            return
        }

        const orderId = `ORD-${nanoid(12)}`
        const amount  = product.price

        const paymentResult = await createQrisPayment(orderId, amount)

        const qrBuffer = await QRCode.toBuffer(paymentResult.payment_number, {
            type: "png",
            width: 300,
            margin: 2,
            color: { dark: "#000000", light: "#FFFFFF" },
        })

        const qrAttachment = new AttachmentBuilder(qrBuffer, { name: "qris-payment.png" })

        const pendingPayment = {
            orderId,
            userId:        interaction.user.id,
            shopId:        shop.id,
            productId:     product.id,
            productName:   getProductName(shop.id, product.id) || product.name,
            amount:        paymentResult.amount,
            fee:           paymentResult.fee,
            totalPayment:  paymentResult.total_payment,
            paymentMethod: paymentResult.payment_method,
            paymentNumber: paymentResult.payment_number,
            status:        "pending" as const,
            createdAt:     new Date(),
            expiredAt:     new Date(paymentResult.expired_at),
            channelId:     interaction.channelId,
            guildId:       interaction.guildId!,
        }

        addPendingPayment(pendingPayment)

        const expiredTimestamp = Math.floor(pendingPayment.expiredAt.getTime() / 1000)

        const paymentEmbed = new EmbedBuilder()
            .setTitle("💳 Pembayaran QRIS")
            .setDescription(
                `**Produk:** ${bold(pendingPayment.productName)}\n` +
                `**Toko:** ${bold(shop.name)}\n\n` +
                `💰 **Harga:** Rp ${amount.toLocaleString("id-ID")}\n` +
                `📋 **Biaya Admin:** Rp ${paymentResult.fee.toLocaleString("id-ID")}\n` +
                `💵 **Total Bayar:** Rp ${bold(paymentResult.total_payment.toLocaleString("id-ID"))}\n\n` +
                `⏰ **Expired:** <t:${expiredTimestamp}:R>\n` +
                `📝 **Order ID:** \`${orderId}\`\n\n` +
                `📱 **Scan QR code di bawah ini untuk membayar:**`
            )
            .setImage("attachment://qris-payment.png")
            .setColor(Colors.Gold)
            .setFooter({ text: "Pembayaran akan dikonfirmasi otomatis setelah berhasil" })
            .setTimestamp()

        const cancelButton = new ButtonBuilder()
            .setCustomId(`payment-cancel+${orderId}`)
            .setLabel("❌ Batalkan Pembayaran")
            .setStyle(ButtonStyle.Danger)

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(cancelButton)

        // Simpan referensi pesan agar bisa diedit saat expired
        const paymentMessage = await interaction.followUp({
            embeds:     [paymentEmbed],
            files:      [qrAttachment],
            components: [row],
            flags:      MessageFlags.Ephemeral,
        })

        ActivityLog.paymentCreated({
            username:    interaction.user.username,
            userId:      interaction.user.id,
            productName: pendingPayment.productName,
            shopName:    getShopName(shop.id) || shop.name,
            amount:      paymentResult.total_payment,
            orderId,
            status:      "CREATED",
        })

        // FIX BUG 2: Auto-expire juga update pesan Discord
        const expireTimeout = pendingPayment.expiredAt.getTime() - Date.now()
        if (expireTimeout > 0) {
            setTimeout(async () => {
                // FIX BUG 3: Cek status SEBELUM update (cegah race condition dengan webhook)
                const current = getPendingPayment(orderId)
                if (!current || current.status !== "pending") return

                const expired = updatePendingPaymentStatus(orderId, "expired")
                if (!expired) return

                const expiredEmbed = new EmbedBuilder()
                    .setTitle("⏰ Pembayaran Expired")
                    .setDescription(
                        `Transaksi untuk produk **${expired.productName}** telah kedaluwarsa.\n\n` +
                        `📝 **Order ID:** \`${orderId}\`\n\n` +
                        `Silakan buat transaksi baru jika masih ingin membeli.`
                    )
                    .setColor(Colors.Grey)
                    .setTimestamp()

                try {
                    await paymentMessage.edit({ embeds: [expiredEmbed], components: [], files: [] })
                } catch (e) {
                    PrettyLog.warn(`[PanelShop] Tidak bisa edit pesan expired: ${e}`)
                }

                ActivityLog.paymentStatus({
                    username:    interaction.user.username,
                    userId:      interaction.user.id,
                    productName: expired.productName,
                    shopName:    getShopName(shop.id) || shop.name,
                    amount:      expired.totalPayment,
                    orderId,
                    status:      "EXPIRED",
                })

                removePendingPayment(orderId)
            }, expireTimeout)
        }

    } catch (error) {
        PrettyLog.error(`[PanelShop] Payment failed: ${error}`)
        try {
            // FIX BUG 8: Jangan expose raw error ke user
            await interaction.followUp({
                content: `❌ Gagal membuat transaksi pembayaran. Silakan coba lagi nanti.`,
                flags: MessageFlags.Ephemeral,
            })
        } catch {}
    }
}
