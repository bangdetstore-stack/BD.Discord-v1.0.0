/* Developer: BANGDET.MD */
import {
    ChatInputCommandInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    ButtonInteraction,
    MessageComponentInteraction,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    Colors,
    bold,
    TextInputBuilder,
    TextInputStyle,
    ModalBuilder,
} from "discord.js"
import { getShops } from "./database/shops-database.js"
import { updateProduct } from "./database/products-database.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { Mutex } from "@/lib/mutex.js"

const STOCK_PATH = "data/stock-database.json"
const mutex = new Mutex()

interface StockDbEntry {
    items: string[]
    snk: string
    profpin: boolean
    kode: string
}

let stockDb: Record<string, StockDbEntry> = {}

export async function loadStockDatabase(): Promise<void> {
    try {
        if (existsSync(STOCK_PATH)) {
            stockDb = JSON.parse(await fs.readFile(STOCK_PATH, "utf-8"))
        }
    } catch (e) {
        PrettyLog.error(`[Stock] Gagal load database: ${e}`)
    }
}

async function writeStockDb(): Promise<void> {
    const release = await mutex.acquire()
    try {
        await fs.writeFile(STOCK_PATH, JSON.stringify(stockDb, null, 4), "utf-8")
    } catch (e) {
        PrettyLog.error(`[Stock] Gagal write database: ${e}`)
    } finally {
        release()
    }
}

export function getStockData(productId: string): StockDbEntry | null {
    return stockDb[productId] ?? null
}

export function shiftStockItem(productId: string): string | null {
    const entry = stockDb[productId]
    if (!entry || !entry.items || entry.items.length === 0) return null
    const item = entry.items.shift()
    void writeStockDb()
    return item ?? null
}

function buildShopDropdown(customId: string): ActionRowBuilder<StringSelectMenuBuilder> {
    const shops = getShops()
    const menu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder("🏪 Pilih Toko...")
        .addOptions(
            Array.from(shops.values()).slice(0, 25).map(shop =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(shop.name)
                    .setValue(shop.id)
                    .setDescription(`${shop.products.size} produk`)
            )
        )
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
}

function buildProductDropdown(shopId: string, customIdPrefix: string): ActionRowBuilder<StringSelectMenuBuilder> | null {
    const shops = getShops()
    const shop = shops.get(shopId)
    if (!shop || !shop.products.size) return null

    if (!shop || !shop.products.size) return null
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`${customIdPrefix}+${shopId}`)
        .setPlaceholder("📦 Pilih Produk...")
        .addOptions(
            Array.from(shop.products.values()).slice(0, 25).map(product => {
                const items = stockDb[product.id]?.items ?? []
                return new StringSelectMenuOptionBuilder()
                    .setLabel(product.name.length > 90 ? product.name.slice(0, 87) + "..." : product.name)
                    .setValue(product.id)
                    .setDescription(`Stok: ${items.length} item`)
            })
        )
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
}

// ── /stock add ────────────────────────────────────────────────────────────────

async function showStockAddShopPicker(
    interaction: ChatInputCommandInteraction | MessageComponentInteraction
): Promise<void> {
    const shops = getShops()
    if (!shops.size) {
        await interaction.reply({ content: "❌ Belum ada toko.", flags: MessageFlags.Ephemeral })
        return
    }

    const row = buildShopDropdown("stock-add-select-shop")
    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle("📥 Tambah Stok")
            .setDescription("Pilih toko terlebih dahulu.")
            .setColor(Colors.Blue)],
        components: [row],
        flags: MessageFlags.Ephemeral,
    })
}

export async function handleStockAddStart(interaction: ChatInputCommandInteraction): Promise<void> {
    await showStockAddShopPicker(interaction)
}

export async function handleStockAddFromButton(interaction: MessageComponentInteraction): Promise<void> {
    await showStockAddShopPicker(interaction)
}

export async function handleStockAddShopSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const shopId = interaction.values[0]
    const productRow = buildProductDropdown(shopId, "stock-add-select-product")

    if (!productRow) {
        await interaction.update({ content: "❌ Toko tidak ditemukan atau tidak ada produk.", embeds: [], components: [] })
        return
    }

    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle("📥 Tambah Stok")
            .setDescription("Pilih produk yang ingin ditambah stoknya.")
            .setColor(Colors.Blue)],
        components: [productRow],
    })
}

export async function handleStockAddProductSelect(
    interaction: StringSelectMenuInteraction,
    shopId: string
): Promise<void> {
    const productId = interaction.values[0]
    const shops = getShops()
    const product = shops.get(shopId)?.products.get(productId)

    if (!product) {
        await interaction.update({ content: "❌ Produk tidak ditemukan.", embeds: [], components: [] })
        return
    }

    const currentCount = stockDb[productId]?.items?.length ?? 0

    const shortName = product.name.length > 28 ? product.name.slice(0, 25) + "..." : product.name

    const modal = new ModalBuilder()
        .setCustomId(`stock-modal-add+${shopId}+${productId}`)
        .setTitle(`📥 Stok: ${shortName}`)

    const isProfPin = stockDb[productId]?.profpin ?? false
    const formatHint = isProfPin
        ? "email, password, profil, pin"
        : "email, password"

    const textarea = new TextInputBuilder()
        .setCustomId("stock-items")
        .setLabel(`Tambah stok (saat ini: ${currentCount} item)`)
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder(`Satu item per baris.\nContoh:\n${formatHint}`)
        .setRequired(true)
        .setMaxLength(4000)

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textarea))
    await interaction.showModal(modal)
}

export async function handleStockAddModalSubmit(
    interaction: ModalSubmitInteraction,
    shopId: string,
    productId: string
): Promise<void> {
    const raw = interaction.fields.getTextInputValue("stock-items")
    const lines = raw.split("\n").map(l => l.trim()).filter(l => l.length > 0)

    if (!lines.length) {
        await interaction.reply({ content: "❌ Tidak ada item yang valid.", flags: MessageFlags.Ephemeral })
        return
    }

    if (!stockDb[productId]) {
        stockDb[productId] = { items: [], snk: "", profpin: false, kode: productId }
    }

    const before = stockDb[productId].items.length
    stockDb[productId].items.push(...lines)
    const after = stockDb[productId].items.length

    void writeStockDb()

    // Sinkronkan `amount` di shops.json
    await updateProduct(shopId, productId, { amount: after })

    const shops = getShops()
    const product = shops.get(shopId)?.products.get(productId)
    const productName = product?.name ?? productId

    PrettyLog.success(`[Stock] +${lines.length} item untuk "${productName}" (total: ${after})`)

    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle("✅ Stok Ditambahkan")
            .setDescription(
                `📦 **Produk:** ${bold(productName)}\n\n` +
                `➕ **Ditambahkan:** ${lines.length} item\n` +
                `📊 **Total stok sekarang:** ${bold(String(after))} item\n\n` +
                `*(sebelumnya: ${before} item)*`
            )
            .setColor(0x22c55e)
            .setTimestamp()],
        flags: MessageFlags.Ephemeral,
    })
}

// ── /stock view ───────────────────────────────────────────────────────────────

export async function handleStockView(interaction: ChatInputCommandInteraction): Promise<void> {
    const shops = getShops()
    if (!shops.size) {
        await interaction.reply({ content: "❌ Belum ada toko.", flags: MessageFlags.Ephemeral })
        return
    }

    const embeds: EmbedBuilder[] = []

    for (const shop of shops.values()) {
        if (!shop.products.size) continue

        const fields = Array.from(shop.products.values()).map(product => {
            const items = stockDb[product.id]?.items ?? []
            const statusIcon = items.length > 0 ? "🟢" : "🔴"
            return {
                name: product.name.length > 50 ? product.name.slice(0, 47) + "..." : product.name,
                value: `${statusIcon} \`${items.length} item\``,
                inline: true,
            }
        })

        // Pad to 3 per row
        while (fields.length % 3 !== 0) fields.push({ name: "\u200b", value: "\u200b", inline: true })

        const total = Array.from(shop.products.values()).reduce((sum, p) => {
            return sum + (stockDb[p.id]?.items?.length ?? 0)
        }, 0)

        embeds.push(new EmbedBuilder()
            .setTitle(`🏪 ${shop.name}`)
            .setFields(fields)
            .setFooter({ text: `Total stok: ${total} item di ${shop.products.size} produk` })
            .setColor(Colors.Blue)
        )
    }

    if (!embeds.length) {
        await interaction.reply({ content: "❌ Tidak ada data stok.", flags: MessageFlags.Ephemeral })
        return
    }

    // Discord max 10 embeds per message
    await interaction.reply({ embeds: embeds.slice(0, 10), flags: MessageFlags.Ephemeral })
}

// ── /stock clear ──────────────────────────────────────────────────────────────

export async function handleStockClearStart(interaction: ChatInputCommandInteraction): Promise<void> {
    const shops = getShops()
    if (!shops.size) {
        await interaction.reply({ content: "❌ Belum ada toko.", flags: MessageFlags.Ephemeral })
        return
    }

    const row = buildShopDropdown("stock-clear-select-shop")
    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle("🗑️ Hapus Stok")
            .setDescription("Pilih toko terlebih dahulu.")
            .setColor(Colors.Red)],
        components: [row],
        flags: MessageFlags.Ephemeral,
    })
}

export async function handleStockClearShopSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const shopId = interaction.values[0]
    const productRow = buildProductDropdown(shopId, "stock-clear-select-product")

    if (!productRow) {
        await interaction.update({ content: "❌ Toko tidak ditemukan atau tidak ada produk.", embeds: [], components: [] })
        return
    }

    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle("🗑️ Hapus Stok")
            .setDescription("Pilih produk yang stoknya ingin dihapus.")
            .setColor(Colors.Red)],
        components: [productRow],
    })
}

export async function handleStockClearProductSelect(
    interaction: StringSelectMenuInteraction,
    shopId: string
): Promise<void> {
    const productId = interaction.values[0]
    const shops = getShops()
    const product = shops.get(shopId)?.products.get(productId)

    if (!product) {
        await interaction.update({ content: "❌ Produk tidak ditemukan.", embeds: [], components: [] })
        return
    }

    const currentCount = stockDb[productId]?.items?.length ?? 0

    const confirmBtn = new ButtonBuilder()
        .setCustomId(`stock-clear-confirm+${shopId}+${productId}`)
        .setLabel(`🗑️ Hapus ${currentCount} item`)
        .setStyle(ButtonStyle.Danger)

    const cancelBtn = new ButtonBuilder()
        .setCustomId("stock-clear-cancel")
        .setLabel("Batal")
        .setStyle(ButtonStyle.Secondary)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)

    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle("⚠️ Konfirmasi Hapus Stok")
            .setDescription(
                `Kamu akan menghapus **${currentCount} item** dari produk:\n` +
                `📦 ${bold(product.name)}\n\n` +
                `⚠️ Tindakan ini **tidak bisa dibatalkan**!`
            )
            .setColor(Colors.Red)],
        components: [row],
    })
}

export async function handleStockClearConfirm(
    interaction: ButtonInteraction,
    shopId: string,
    productId: string
): Promise<void> {
    const before = stockDb[productId]?.items?.length ?? 0

    if (stockDb[productId]) {
        stockDb[productId].items = []
    }

    void writeStockDb()
    await updateProduct(shopId, productId, { amount: 0 })

    const shops = getShops()
    const product = shops.get(shopId)?.products.get(productId)

    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle("🗑️ Stok Dihapus")
            .setDescription(
                `📦 **Produk:** ${bold(product?.name ?? productId)}\n` +
                `❌ **Dihapus:** ${before} item`
            )
            .setColor(Colors.Grey)
            .setTimestamp()],
        components: [],
    })

    PrettyLog.info(`[Stock] Cleared ${before} items dari produk ${productId}`)
}

export async function handleStockClearCancel(interaction: ButtonInteraction): Promise<void> {
    await interaction.update({
        content: "Dibatalkan.",
        embeds: [],
        components: [],
    })
}
