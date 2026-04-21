/* Developer: BANGDET.MD */
import QRCode from "qrcode"
import { EVENTS } from "@/middleware.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { ActivityLog } from "@/lib/activity-log.js"
import { t } from "@/lib/localization.js"
import { getOrCreateAccount, setAccountItemAmount } from "@/features/accounts/database/accounts-database.js"
import { getProductName } from "@/features/shops/database/products-database.js"
import { getShopName } from "@/features/shops/database/shops-database.js"
import { Product } from "@/features/shops/database/products-types.js"
import { Shop } from "@/features/shops/database/shops-types.js"
import { updateProduct } from "@/features/shops/database/products-database.js"
import { createQrisPayment, cancelPakasirPayment } from "./service/pakasir-service.js"
import {
    addPendingPayment,
    updatePendingPaymentStatus,
    removePendingPayment,
    getPaymentByUserId,
    getPendingPayment,
    getAllPendingPayments,
} from "./database/payment-store.js"
import { PendingPayment } from "./database/payment-types.js"
import { getProductForm, addPurchaseRecord } from "@/features/warranty/warranty-database.js"
import { startWarrantyForOrder, buildWarrantyButton, buildComplaintButton } from "@/features/warranty/warranty-flow.js"
import { nanoid } from "nanoid"
import {
    ChatInputCommandInteraction,
    MessageComponentInteraction,
    ButtonInteraction,
    EmbedBuilder,
    Colors,
    AttachmentBuilder,
    bold,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    Client,
    WebhookClient,
} from "discord.js"

let discordClient: Client | null = null

export function setPaymentClient(client: Client): void {
    discordClient = client
}

export async function startPaymentFlow(
    interaction: ButtonInteraction,
    shop: Shop,
    product: Product
): Promise<void> {
    // Cek payment pending yang sudah ada
    const existingPayment = getPaymentByUserId(interaction.user.id)
    if (existingPayment) {
        await interaction.reply({
            content: `❌ Kamu masih memiliki transaksi yang belum selesai (Order: ${bold(existingPayment.orderId)}). Silakan selesaikan atau batalkan terlebih dahulu.`,
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    // Cek stok — termasuk slot yang sedang "dipesan" oleh payment QRIS lain yang masih pending
    if (product.amount !== undefined) {
        const reservedSlots = [...getAllPendingPayments().values()].filter(
            p => p.productId === product.id && p.status === "pending"
        ).length
        const effectiveStock = product.amount - reservedSlots
        if (effectiveStock <= 0) {
            await interaction.reply({
                content: `❌ Produk **${getProductName(shop.id, product.id)}** sudah habis!`,
                flags: MessageFlags.Ephemeral,
            })
            return
        }
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const orderId = `ORD-${nanoid(12)}`
    const amount = product.price

    try {
        const paymentResult = await createQrisPayment(orderId, amount)

        const qrBuffer = await QRCode.toBuffer(paymentResult.payment_number, {
            type: "png",
            width: 300,
            margin: 2,
            color: { dark: "#000000", light: "#FFFFFF" },
        })

        const qrAttachment = new AttachmentBuilder(qrBuffer, { name: "qris-payment.png" })

        const pendingPayment: PendingPayment = {
            orderId,
            userId: interaction.user.id,
            shopId: shop.id,
            productId: product.id,
            productName: getProductName(shop.id, product.id) || product.name,
            amount: paymentResult.amount,
            fee: paymentResult.fee,
            totalPayment: paymentResult.total_payment,
            paymentMethod: paymentResult.payment_method,
            paymentNumber: paymentResult.payment_number,
            status: "pending",
            createdAt: new Date(),
            expiredAt: new Date(paymentResult.expired_at),
            channelId: interaction.channelId,
            guildId: interaction.guildId!,
            interactionToken: interaction.token,
            applicationId: interaction.client.application?.id,
        }

        addPendingPayment(pendingPayment)

        const expiredTimestamp = Math.floor(pendingPayment.expiredAt.getTime() / 1000)

        const paymentEmbed = new EmbedBuilder()
            .setTitle("💳 Pembayaran QRIS")
            .setDescription(
                `**Produk:** ${bold(pendingPayment.productName)}\n` +
                `**Toko:** ${bold(getShopName(shop.id) || "Unknown")}\n\n` +
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

        await interaction.editReply({
            embeds: [paymentEmbed],
            files: [qrAttachment],
            components: [row],
        })

        // Kirim DM sebagai backup (kalau ephemeral di-dismiss / Discord di-refresh)
        try {
            const qrAttachmentDm = new AttachmentBuilder(qrBuffer, { name: "qris-payment.png" })
            const dmEmbed = new EmbedBuilder()
                .setTitle("💳 Invoice Pembayaran QRIS")
                .setDescription(
                    `> Pesan ini dikirim otomatis sebagai backup QR kamu.\n> Jika QR di server hilang, gunakan QR di sini.\n\n` +
                    `**Produk:** ${bold(pendingPayment.productName)}\n` +
                    `**Toko:** ${bold(getShopName(shop.id) || "Unknown")}\n\n` +
                    `💰 **Harga:** Rp ${amount.toLocaleString("id-ID")}\n` +
                    `📋 **Biaya Admin:** Rp ${paymentResult.fee.toLocaleString("id-ID")}\n` +
                    `💵 **Total Bayar:** Rp ${bold(paymentResult.total_payment.toLocaleString("id-ID"))}\n\n` +
                    `⏰ **Expired:** <t:${expiredTimestamp}:R>\n` +
                    `📝 **Order ID:** \`${orderId}\`\n\n` +
                    `📱 **Scan QR code di bawah untuk membayar:**`
                )
                .setImage("attachment://qris-payment.png")
                .setColor(Colors.Gold)
                .setFooter({ text: "Untuk membatalkan, kembali ke server dan klik tombol Batalkan." })
                .setTimestamp()

            await interaction.user.send({
                embeds: [dmEmbed],
                files: [qrAttachmentDm],
            })
        } catch {
            // DM user mungkin dinonaktifkan — tidak masalah, ephemeral tetap terkirim
        }

        // Auto-expire timer
        const expireTimeout = pendingPayment.expiredAt.getTime() - Date.now()
        if (expireTimeout > 0) {
            setTimeout(() => handlePaymentExpired(orderId, interaction), expireTimeout)
        }

        ActivityLog.paymentCreated({
            username:    interaction.user.username,
            userId:      interaction.user.id,
            productName: getProductName(shop.id, product.id) || product.name,
            shopName:    getShopName(shop.id) || shop.name,
            amount:      paymentResult.total_payment,
            orderId,
            status:      "CREATED",
        })

    } catch (error) {
        PrettyLog.error(`[Payment] Gagal membuat payment: ${error}`)
        await interaction.editReply({
            content: `❌ Gagal membuat transaksi pembayaran. Silakan coba lagi nanti.`,
        })
    }
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function handlePaymentCancel(interaction: ButtonInteraction, orderId: string): Promise<void> {
    // FIX BUG 4: Cek kepemilikan SEBELUM mengubah status
    const payment = getPendingPayment(orderId)
    if (!payment || payment.status !== "pending") {
        await interaction.reply({
            content: "❌ Transaksi tidak ditemukan atau sudah selesai.",
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    if (payment.userId !== interaction.user.id) {
        await interaction.reply({
            content: "❌ Kamu tidak bisa membatalkan transaksi orang lain.",
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    // Baru update status setelah validasi lolos
    updatePendingPaymentStatus(orderId, "canceled")

    try {
        await cancelPakasirPayment(orderId, payment.amount)
    } catch (error) {
        PrettyLog.warn(`[Payment] Gagal cancel di Pakasir: ${error}`)
    }

    const cancelEmbed = new EmbedBuilder()
        .setTitle("❌ Pembayaran Dibatalkan")
        .setDescription(
            `Transaksi untuk produk **${payment.productName}** telah dibatalkan.\n\n` +
            `📝 **Order ID:** \`${orderId}\``
        )
        .setColor(Colors.Red)
        .setTimestamp()

    await interaction.update({
        embeds: [cancelEmbed],
        components: [],
        files: [],
    })

    ActivityLog.paymentStatus({
        username:    interaction.user.username,
        userId:      interaction.user.id,
        productName: payment.productName,
        shopName:    getShopName(payment.shopId) || payment.shopId,
        amount:      payment.totalPayment,
        orderId,
        status:      "CANCELED",
    })

    removePendingPayment(orderId)
}

// ── Expiry ────────────────────────────────────────────────────────────────────

// FIX BUG 3: Cek status SEBELUM update untuk cegah race condition
async function handlePaymentExpired(
    orderId: string,
    interaction: MessageComponentInteraction | ChatInputCommandInteraction
): Promise<void> {
    // Ambil status terkini dulu
    const current = getPendingPayment(orderId)
    if (!current || current.status !== "pending") return

    const payment = updatePendingPaymentStatus(orderId, "expired")
    if (!payment) return

    const expiredEmbed = new EmbedBuilder()
        .setTitle("⏰ Pembayaran Expired")
        .setDescription(
            `Transaksi untuk produk **${payment.productName}** telah kedaluwarsa.\n\n` +
            `📝 **Order ID:** \`${orderId}\`\n\n` +
            `Silakan buat transaksi baru jika masih ingin membeli.`
        )
        .setColor(Colors.Grey)
        .setTimestamp()

    try {
        await interaction.editReply({
            embeds: [expiredEmbed],
            components: [],
            files: [],
        })
    } catch (error) {
        PrettyLog.warn(`[Payment] Tidak bisa update pesan expired: ${error}`)
    }

    ActivityLog.paymentStatus({
        username:    payment.userId,
        userId:      payment.userId,
        productName: payment.productName,
        shopName:    getShopName(payment.shopId) || payment.shopId,
        amount:      payment.totalPayment,
        orderId,
        status:      "EXPIRED",
    })

    removePendingPayment(orderId)
}

// ── Delivery ──────────────────────────────────────────────────────────────────

function handlePaymentCompleted(orderId: string): void {
    const payment = updatePendingPaymentStatus(orderId, "completed")
    if (!payment) {
        PrettyLog.warn(`[Payment] paymentCompleted event tapi tidak ada pending payment untuk order_id=${orderId}`)
        return
    }

    ActivityLog.paymentStatus({
        username:    payment.userId,
        userId:      payment.userId,
        productName: payment.productName,
        shopName:    getShopName(payment.shopId) || payment.shopId,
        amount:      payment.totalPayment,
        orderId,
        status:      "COMPLETED",
    })

    deliverItem(payment).catch((error) => {
        PrettyLog.error(`[Payment] Gagal deliver item: ${error}`)
    })
}

async function deliverItem(payment: PendingPayment): Promise<void> {
    if (!discordClient) {
        PrettyLog.error("[Payment] Discord client belum diset, tidak bisa deliver item")
        return
    }

    const { checkAndMarkDelivered } = await import("./database/payment-store.js")
    const isAlreadyDelivered = await checkAndMarkDelivered(payment.orderId)
    if (isAlreadyDelivered) {
        PrettyLog.warn(`[Payment] Order ${payment.orderId} sudah pernah dideliver! (Idempotency Guard)`)
        return
    }

    try {
        const { getProducts } = await import("@/features/shops/database/products-database.js")
        const [prodError, products] = getProducts(payment.shopId)

        if (prodError || !products) {
            PrettyLog.error(`[Payment] Tidak bisa temukan toko ${payment.shopId} untuk delivery`)
            return
        }

        const product = products.get(payment.productId)
        if (!product) {
            PrettyLog.error(`[Payment] Tidak bisa temukan produk ${payment.productId} di toko ${payment.shopId}`)
            return
        }

        // ── Ambil stok dari stock-handler ──
        let stockItem = ""
        let snk = ""
        let profpin = false
        try {
            const { getStockData, shiftStockItem } = await import("@/features/shops/stock-handler.js")
            const stockData = getStockData(payment.productId)

            if (stockData) {
                snk = stockData.snk || ""
                profpin = stockData.profpin || false

                const item = shiftStockItem(payment.productId)
                if (item) {
                    stockItem = item
                    
                    // Gunakan data terbaru setelah shift
                    const remainingData = getStockData(payment.productId)
                    await updateProduct(payment.shopId, payment.productId, {
                        amount: remainingData?.items.length ?? 0
                    })
                }
            }
        } catch (stockError) {
            PrettyLog.warn(`[Payment] Tidak bisa baca stok: ${stockError}`)
        }

        // ── Parse item untuk ditampilkan ──
        let accountDetails = ""
        if (stockItem) {
            const parts = stockItem.split(",").map((s: string) => s.trim())
            if (profpin && parts.length >= 4) {
                accountDetails =
                    `💌 Email: \`${parts[0]}\`\n` +
                    `🔐 Password: \`${parts[1]}\`\n` +
                    `👤 Profile: \`${parts[2]}\`\n` +
                    `🔢 PIN: \`${parts[3]}\``
            } else if (parts.length >= 2) {
                accountDetails =
                    `💌: \`${parts[0]}\`\n` +
                    `🔐: \`${parts[1]}\``
                if (parts.length > 2) {
                    accountDetails += `\n📝: \`${parts.slice(2).join(", ")}\``
                }
            } else {
                accountDetails = `📋: \`${stockItem}\``
            }
        } else {
            accountDetails = "⚠️ Stok sedang diproses manual. Hubungi admin."
        }

        // ── Waktu invoice ──
        const now = new Date()
        const dateStr = now.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" })
        const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

        // ── Tambah ke inventory ──
        const user = await getOrCreateAccount(payment.userId)
        const userProductAmount = user.inventory.get(payment.productId)?.amount || 0
        await setAccountItemAmount(payment.userId, product, userProductAmount + 1)

        // ── Simpan purchase history ──
        const shopNameForRecord = getShopName(payment.shopId) || payment.shopId
        addPurchaseRecord(payment.userId, {
            orderId:     payment.orderId,
            productId:   payment.productId,
            productName: payment.productName,
            shopId:      payment.shopId,
            shopName:    shopNameForRecord,
            purchasedAt: new Date().toISOString(),
            guildId:     payment.guildId,
        })

        // ── Assign Discord roles ──
        try {
            const { handlePurchaseRoles } = await import("@/features/roles/role-handler.js")
            await handlePurchaseRoles(payment.userId, payment.guildId, shopNameForRecord, payment.productName)
        } catch (e) {
            PrettyLog.warn(`[Roles] Gagal assign role untuk ${payment.userId}: ${e}`)
        }

        // ── Kirim DM premium ──
        const discordUser = await discordClient.users.fetch(payment.userId)

        const successEmbed = new EmbedBuilder()
            .setTitle("🎉 PEMBELIAN BERHASIL 🎉")
            .setDescription(
                `Terima kasih sudah berbelanja!\n\n` +
                `━━━━━━━━━━━━━━━━━━━━\n` +
                `📦 **Produk:** ${bold(payment.productName)}\n` +
                `🔢 **Jumlah:** 1\n` +
                `💰 **Total:** Rp ${bold(payment.totalPayment.toLocaleString("id-ID"))}\n` +
                `⏰ **Waktu:** ${dateStr}, ${timeStr}\n` +
                `🆔 **Order:** \`${payment.orderId}\`\n` +
                `━━━━━━━━━━━━━━━━━━━━`
            )
            .setColor(0x22c55e)
            .setThumbnail(discordUser.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: `Order ID: ${payment.orderId}` })

        const detailEmbed = new EmbedBuilder()
            .setTitle("📋 Detail Akun")
            .setDescription(accountDetails)
            .setColor(0x3b82f6)

        const embeds = [successEmbed, detailEmbed]

        if (snk) {
            const snkTruncated = snk.length > 1024 ? snk.substring(0, 1021) + "..." : snk
            const snkEmbed = new EmbedBuilder()
                .setTitle("⚠️ SYARAT DAN KETENTUAN")
                .setDescription(snkTruncated)
                .setColor(0xf59e0b)
            embeds.push(snkEmbed)
        }

        const helpButton = new ButtonBuilder()
            .setLabel("💬 Butuh Bantuan?")
            .setStyle(ButtonStyle.Link)
            .setURL("https://wa.me/6285156185114")

        const formConfig    = getProductForm(payment.productId)
        const hasForm       = formConfig?.enabled === true

        const registrationHours = formConfig?.registrationHours ?? 24
        const expiryAt = new Date()
        expiryAt.setHours(expiryAt.getHours() + registrationHours)
        const expiryTs = Math.floor(expiryAt.getTime() / 1000)

        const dmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...(hasForm ? [buildWarrantyButton(payment.orderId)] : []),
            buildComplaintButton(payment.orderId),
            helpButton,
        )

        const dmEmbeds = [...embeds]
        if (hasForm) {
            const warrantyDays = formConfig?.warrantyDays ?? 0
            dmEmbeds.push(
                new EmbedBuilder()
                    .setTitle("📋 Form Garansi")
                    .setDescription(
                        `Klik tombol **Isi Form Garansi** di bawah untuk mengaktifkan garansi produkmu.\n\n` +
                        `⏰ Batas pengisian: <t:${expiryTs}:R>\n` +
                        (warrantyDays > 0 ? `🛡️ Masa garansi: **${warrantyDays} hari** sejak pembelian\n` : `♾️ Garansi: **Tidak ada batas waktu**\n`) +
                        `⚠️ Jika tidak diisi, garansi akan hangus otomatis.`
                    )
                    .setColor(Colors.Yellow)
            )
        }

        let dmSent = false
        try {
            await discordUser.send({ embeds: dmEmbeds, components: [dmRow] })
            dmSent = true
        } catch {
            PrettyLog.warn(`[Payment] Tidak bisa DM user ${payment.userId} — DM dinonaktifkan. Produk sudah masuk inventaris.`)
        }

        // Edit original ephemeral QR message to show "Pembayaran Berhasil"
        if (payment.interactionToken && payment.applicationId) {
            try {
                const successDesc = dmSent
                    ? `Pembayaran untuk **${payment.productName}** telah dikonfirmasi.\n\n` +
                      `📝 **Order ID:** \`${payment.orderId}\`\n` +
                      `💵 **Total:** Rp ${payment.totalPayment.toLocaleString("id-ID")}\n\n` +
                      `📬 Detail produk telah dikirim ke **DM** kamu.`
                    : `Pembayaran untuk **${payment.productName}** telah dikonfirmasi.\n\n` +
                      `📝 **Order ID:** \`${payment.orderId}\`\n` +
                      `💵 **Total:** Rp ${payment.totalPayment.toLocaleString("id-ID")}\n\n` +
                      `⚠️ **DM kamu tertutup** — detail produk tidak bisa dikirim lewat DM.\n` +
                      `Produk sudah tersimpan di akun kamu. Gunakan \`/account\` → Inventaris untuk melihat produk, ` +
                      `dan \`/garansi\` untuk mengisi form garansi.`

                const successEmbed = new EmbedBuilder()
                    .setTitle("✅ Pembayaran Berhasil!")
                    .setDescription(successDesc)
                    .setColor(dmSent ? Colors.Green : Colors.Orange)
                    .setTimestamp()

                const webhook = new WebhookClient({
                    id: payment.applicationId,
                    token: payment.interactionToken,
                })
                await webhook.editMessage("@original", {
                    embeds: [successEmbed],
                    components: [],
                    files: [],
                })
            } catch {
                // Token mungkin sudah expired (>15 menit)
            }
        }

        if (hasForm) {
            startWarrantyForOrder({
                orderId:           payment.orderId,
                userId:            payment.userId,
                productId:         payment.productId,
                productName:       payment.productName,
                shopId:            payment.shopId,
                shopName:          getShopName(payment.shopId) || payment.shopId,
                purchasedAt:       new Date().toISOString(),
                reminderSent:      false,
                guildId:           payment.guildId,
                registrationHours: registrationHours,
            })
        }

        ActivityLog.delivery({
            username:    discordUser.username,
            userId:      payment.userId,
            productName: payment.productName,
            shopName:    getShopName(payment.shopId) || payment.shopId,
            orderId:     payment.orderId,
        })

        // ── Log ke channel admin (FIX BUG 9: hapus channel fetch yang tidak perlu) ──
        try {
            const { getSettings } = await import("@/features/settings/database/settings-handler.js")
            const logChannelSetting = getSettings().get("logChannelId")

            if (logChannelSetting?.value && logChannelSetting.type === "channelId") {
                const guild = await discordClient.guilds.fetch(payment.guildId)
                const logChannel = await guild.channels.fetch(logChannelSetting.value as string)

                if (logChannel && logChannel.isTextBased()) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("✅ Pembayaran Berhasil")
                        .setDescription(
                            `👤 **User:** ${discordUser.username}\n` +
                            `📦 **Produk:** ${payment.productName}\n` +
                            `💰 **Total:** Rp ${payment.totalPayment.toLocaleString("id-ID")}\n` +
                            `🆔 **Order:** \`${payment.orderId}\``
                        )
                        .setColor(0x22c55e)
                        .setTimestamp()
                    await logChannel.send({ embeds: [logEmbed] })
                }
            }
        } catch (logError) {
            PrettyLog.warn(`[Payment] Tidak bisa kirim log ke channel: ${logError}`)
        }

    } catch (error) {
        PrettyLog.error(`[Payment] Error saat deliver item: ${error}`)

        // Kirim DM ke user tentang masalah ini
        try {
            const discordUser = await discordClient!.users.fetch(payment.userId)
            const errorEmbed = new EmbedBuilder()
                .setTitle("⚠️ Pembayaran Diterima")
                .setDescription(
                    `Pembayaran kamu (Order: \`${payment.orderId}\`) **berhasil diterima**, ` +
                    `tapi ada masalah saat mengirim item.\n\n` +
                    `Silakan hubungi admin untuk bantuan.`
                )
                .setColor(0xf59e0b)
                .setTimestamp()

            const helpBtn = new ButtonBuilder()
                .setLabel("💬 Hubungi Admin")
                .setStyle(ButtonStyle.Link)
                .setURL("https://wa.me/6285156185114")

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(helpBtn)
            await discordUser.send({ embeds: [errorEmbed], components: [row] })
        } catch {
            PrettyLog.error(`[Payment] Tidak bisa DM user tentang delivery failure`)
        }
    }

    removePendingPayment(payment.orderId)
}

// ── Restore expire timers after bot restart ────────────────────────────────────

export function restorePaymentExpireTimers(): void {
    const now = Date.now()
    for (const payment of getAllPendingPayments().values()) {
        if (payment.status !== "pending") continue

        const msUntilExpiry = payment.expiredAt.getTime() - now

        if (msUntilExpiry <= 0) {
            // Already expired while bot was offline — mark expired and DM user
            updatePendingPaymentStatus(payment.orderId, "expired")
            if (discordClient) {
                discordClient.users.fetch(payment.userId).then(user => {
                    const embed = new EmbedBuilder()
                        .setTitle("⏰ Pembayaran Expired")
                        .setDescription(
                            `Transaksi untuk produk **${payment.productName}** telah kedaluwarsa saat bot offline.\n\n` +
                            `📝 **Order ID:** \`${payment.orderId}\`\n\n` +
                            `Silakan buat transaksi baru jika masih ingin membeli.`
                        )
                        .setColor(Colors.Grey)
                        .setTimestamp()
                    user.send({ embeds: [embed] }).catch(() => {})
                }).catch(() => {})
            }
            removePendingPayment(payment.orderId)
            PrettyLog.warn(`[Payment] Order ${payment.orderId} sudah expired saat bot offline — dihapus`)
        } else {
            // Reschedule the expire timer
            setTimeout(() => {
                const current = getPendingPayment(payment.orderId)
                if (!current || current.status !== "pending") return

                updatePendingPaymentStatus(payment.orderId, "expired")
                if (discordClient) {
                    discordClient.users.fetch(payment.userId).then(user => {
                        const embed = new EmbedBuilder()
                            .setTitle("⏰ Pembayaran Expired")
                            .setDescription(
                                `Transaksi untuk produk **${payment.productName}** telah kedaluwarsa.\n\n` +
                                `📝 **Order ID:** \`${payment.orderId}\`\n\n` +
                                `Silakan buat transaksi baru jika masih ingin membeli.`
                            )
                            .setColor(Colors.Grey)
                            .setTimestamp()
                        user.send({ embeds: [embed] }).catch(() => {})
                    }).catch(() => {})
                }
                removePendingPayment(payment.orderId)
                PrettyLog.info(`[Payment] Order ${payment.orderId} expired setelah timer dipulihkan`)
            }, msUntilExpiry)
            PrettyLog.info(`[Payment] Timer dipulihkan untuk order ${payment.orderId} — expire dalam ${Math.round(msUntilExpiry / 1000)}s`)
        }
    }
}

// ── Event listener dari webhook ───────────────────────────────────────────────

EVENTS.on("paymentCompleted", (orderId: string) => {
    handlePaymentCompleted(orderId)
})
