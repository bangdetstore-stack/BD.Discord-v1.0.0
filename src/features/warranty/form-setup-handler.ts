/* Developer: BANGDET.MD */
import {
    ButtonInteraction,
    MessageComponentInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} from "discord.js"
import { getShops } from "@/features/shops/database/shops-database.js"
import { getProductForm, setProductForm } from "./warranty-database.js"
import { getSetting, setSetting } from "@/features/settings/database/settings-handler.js"
import { PrettyLog } from "@/lib/pretty-log.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseChannelId(raw: string): string | null {
    const cleaned = raw.trim().replace(/^<#/, "").replace(/>$/, "")
    if (/^\d{17,20}$/.test(cleaned)) return cleaned
    return null
}

// ── Log Channel setup (Transaksi + Garansi dalam 1 modal) ────────────────────

export async function handleLogChannelSetup(
    interaction: MessageComponentInteraction,
    _panelId: string
): Promise<void> {
    const txSetting = getSetting("logChannelId")
    const waSetting = getSetting("warrantyLogChannelId")
    const txVal     = txSetting?.value ? `${txSetting.value}` : ""
    const waVal     = waSetting?.value ? `${waSetting.value}` : ""

    const txInput = new TextInputBuilder()
        .setCustomId("log_tx")
        .setLabel("Log Transaksi — Channel ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(30)
        .setPlaceholder("Kosong = tidak diubah")
    if (txVal) txInput.setValue(txVal)

    const waInput = new TextInputBuilder()
        .setCustomId("log_wa")
        .setLabel("Log Garansi — Channel ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(30)
        .setPlaceholder("Kosong = tidak diubah")
    if (waVal) waInput.setValue(waVal)

    const modal = new ModalBuilder()
        .setCustomId("setup-modal-log")
        .setTitle("Setup Log Channel")
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(txInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(waInput),
        )

    await interaction.showModal(modal)
}

export async function handleLogChannelModalSubmit(
    interaction: ModalSubmitInteraction
): Promise<void> {
    const rawTx = interaction.fields.getTextInputValue("log_tx").trim()
    const rawWa = interaction.fields.getTextInputValue("log_wa").trim()

    const results: string[] = []
    const errors:  string[] = []

    if (rawTx) {
        const id = parseChannelId(rawTx)
        if (id) {
            await setSetting("logChannelId", id)
            results.push(`📊 **Log Transaksi** → <#${id}>`)
            PrettyLog.success(`[Setup] Log Transaksi diset: ${id}`)
        } else {
            errors.push("📊 Log Transaksi: ID tidak valid")
        }
    }

    if (rawWa) {
        const id = parseChannelId(rawWa)
        if (id) {
            await setSetting("warrantyLogChannelId", id)
            results.push(`🛡️ **Log Garansi** → <#${id}>`)
            PrettyLog.success(`[Setup] Log Garansi diset: ${id}`)
        } else {
            errors.push("🛡️ Log Garansi: ID tidak valid")
        }
    }

    const lines = [
        ...results,
        ...errors.map(e => `❌ ${e}`),
        ...(!rawTx && !rawWa ? ["⚠️ Tidak ada perubahan (semua field kosong)."] : []),
    ]

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("📊 Log Channel")
                .setDescription(lines.join("\n"))
                .setColor(errors.length && !results.length ? Colors.Red : Colors.Green),
        ],
        flags: MessageFlags.Ephemeral,
    })
}

// ── Claim Channel setup ───────────────────────────────────────────────────────

export async function handleClaimSetup(
    interaction: MessageComponentInteraction,
    _panelId: string
): Promise<void> {
    const chSetting    = getSetting("claimChannelId")
    const rolesSetting = getSetting("claimAdminRoles")
    const chVal        = chSetting?.value    ? `${chSetting.value}`    : ""
    const rolesVal     = rolesSetting?.value ? `${rolesSetting.value}` : ""

    const chInput = new TextInputBuilder()
        .setCustomId("claim_channel")
        .setLabel("Channel Tiket Komplain — Channel ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(30)
        .setPlaceholder("ID channel untuk thread tiket")
    if (chVal) chInput.setValue(chVal)

    const rolesInput = new TextInputBuilder()
        .setCustomId("claim_roles")
        .setLabel("Role Admin (pisah koma, maks 5)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(200)
        .setPlaceholder("cth: 123456789,987654321")
    if (rolesVal) rolesInput.setValue(rolesVal)

    const modal = new ModalBuilder()
        .setCustomId("setup-modal-claim")
        .setTitle("Setup Panel Komplain")
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(chInput),
            new ActionRowBuilder<TextInputBuilder>().addComponents(rolesInput),
        )

    await interaction.showModal(modal)
}

export async function handleClaimModalSubmit(
    interaction: ModalSubmitInteraction
): Promise<void> {
    const rawCh    = interaction.fields.getTextInputValue("claim_channel").trim()
    const rawRoles = interaction.fields.getTextInputValue("claim_roles").trim()

    const results: string[] = []
    const errors:  string[] = []

    if (rawCh) {
        const id = parseChannelId(rawCh)
        if (id) {
            await setSetting("claimChannelId", id)
            results.push(`🎫 **Channel Komplain** → <#${id}>`)
            PrettyLog.success(`[Setup] Claim channel diset: ${id}`)
        } else {
            errors.push("🎫 Channel Komplain: ID tidak valid")
        }
    }

    if (rawRoles) {
        const roleIds = rawRoles.split(",").map(r => r.trim()).filter(Boolean)
        const valid   = roleIds.every(r => /^\d{17,20}$/.test(r))
        if (valid && roleIds.length > 0 && roleIds.length <= 5) {
            const joined = roleIds.join(",")
            await setSetting("claimAdminRoles", joined)
            results.push(`👮 **Role Admin:** ${roleIds.map(r => `<@&${r}>`).join(", ")}`)
            PrettyLog.success(`[Setup] Claim admin roles diset: ${joined}`)
        } else {
            errors.push("👮 Role Admin: ID tidak valid atau terlalu banyak (maks 5)")
        }
    }

    const lines = [
        ...results,
        ...errors.map(e => `❌ ${e}`),
        ...(!rawCh && !rawRoles ? ["⚠️ Tidak ada perubahan (semua field kosong)."] : []),
    ]

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("🎫 Panel Komplain")
                .setDescription(lines.join("\n"))
                .setColor(errors.length && !results.length ? Colors.Red : Colors.Green),
        ],
        flags: MessageFlags.Ephemeral,
    })
}

// ── Form Garansi: shop picker ─────────────────────────────────────────────────

export async function handleFormSetupButton(interaction: MessageComponentInteraction): Promise<void> {
    const shops = getShops()
    if (!shops.size) {
        await interaction.reply({ content: "❌ Belum ada toko.", flags: MessageFlags.Ephemeral })
        return
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId("formconfig-select-shop")
        .setPlaceholder("🏪 Pilih Toko...")
        .addOptions(
            Array.from(shops.values()).slice(0, 25).map(shop =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(shop.name.slice(0, 100))
                    .setValue(shop.id)
                    .setDescription(`${shop.products.size} produk`)
            )
        )

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("📋 Setup Form Garansi")
                .setDescription("Pilih toko untuk mengonfigurasi form garansi produk.")
                .setColor(Colors.Blue),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
        flags: MessageFlags.Ephemeral,
    })
}

// ── Form Garansi: product picker ──────────────────────────────────────────────

export async function handleFormSetupShopSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    const shopId = interaction.values[0]
    const shops  = getShops()
    const shop   = shops.get(shopId)

    if (!shop || !shop.products.size) {
        await interaction.update({ content: "❌ Toko tidak ditemukan.", embeds: [], components: [] })
        return
    }

    const forms = await import("./warranty-database.js").then(m => m.getProductForms())

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`formconfig-select-product+${shopId}`)
        .setPlaceholder("📦 Pilih Produk...")
        .addOptions(
            Array.from(shop.products.values()).slice(0, 25).map(product => {
                const cfg     = forms[product.id]
                const status  = cfg?.enabled ? "✅ Aktif" : "⬜ Nonaktif"
                return new StringSelectMenuOptionBuilder()
                    .setLabel(product.name.length > 90 ? product.name.slice(0, 87) + "..." : product.name)
                    .setValue(product.id)
                    .setDescription(status)
            })
        )

    await interaction.update({
        embeds: [
            new EmbedBuilder()
                .setTitle("📋 Setup Form Garansi")
                .setDescription(`Pilih produk dari **${shop.name}** untuk dikonfigurasi.`)
                .setColor(Colors.Blue),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    })
}

// ── Form Garansi: config modal ────────────────────────────────────────────────

export async function handleFormSetupProductSelect(
    interaction: StringSelectMenuInteraction,
    shopId: string
): Promise<void> {
    const productId = interaction.values[0]
    const shops     = getShops()
    const product   = shops.get(shopId)?.products.get(productId)

    if (!product) {
        await interaction.update({ content: "❌ Produk tidak ditemukan.", embeds: [], components: [] })
        return
    }

    const existing = getProductForm(productId)

    const shortName = product.name.length > 22 ? product.name.slice(0, 19) + "..." : product.name

    const modal = new ModalBuilder()
        .setCustomId(`formconfig-modal+${productId}`)
        .setTitle(`Form: ${shortName}`)

    const aktif = new TextInputBuilder()
        .setCustomId("fc_aktif")
        .setLabel("Aktif? (ya / tidak)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(5)
        .setPlaceholder("ya")
    if (existing) aktif.setValue(existing.enabled ? "ya" : "tidak")

    // Combined field: "warrantyDays/registrationHours" — e.g. "30/24" or just "30"
    const durasi = new TextInputBuilder()
        .setCustomId("fc_durasi")
        .setLabel("Garansi(hari) / Registrasi(jam)  cth: 30/24")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(10)
        .setPlaceholder("30/24  (0 = tidak ada batas garansi)")
    if (existing) {
        const wDays = existing.warrantyDays ?? 0
        const rHrs  = existing.registrationHours ?? 24
        durasi.setValue(`${wDays}/${rHrs}`)
    }

    const f1 = new TextInputBuilder()
        .setCustomId("fc_f1")
        .setLabel("Field 1 Label (kosong = nonaktif)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(45)
        .setPlaceholder("cth: Username Akun")
    if (existing?.field1Label) f1.setValue(existing.field1Label)

    const f2 = new TextInputBuilder()
        .setCustomId("fc_f2")
        .setLabel("Field 2 Label (kosong = nonaktif)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(45)
        .setPlaceholder("cth: Email Akun")
    if (existing?.field2Label) f2.setValue(existing.field2Label)

    const screenshot = new TextInputBuilder()
        .setCustomId("fc_ss")
        .setLabel("Wajib Screenshot? (ya / tidak)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(5)
        .setPlaceholder("tidak")
    if (existing) screenshot.setValue(existing.requireScreenshot ? "ya" : "tidak")

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(aktif),
        new ActionRowBuilder<TextInputBuilder>().addComponents(durasi),
        new ActionRowBuilder<TextInputBuilder>().addComponents(f1),
        new ActionRowBuilder<TextInputBuilder>().addComponents(f2),
        new ActionRowBuilder<TextInputBuilder>().addComponents(screenshot),
    )

    await interaction.showModal(modal)
}

// ── Form Garansi: save config ─────────────────────────────────────────────────

export async function handleFormConfigModalSubmit(
    interaction: ModalSubmitInteraction,
    productId: string
): Promise<void> {
    const fields     = interaction.fields
    const enabled    = fields.getTextInputValue("fc_aktif").trim().toLowerCase() === "ya"
    const rawDurasi  = fields.getTextInputValue("fc_durasi").trim()
    const f1         = fields.getTextInputValue("fc_f1").trim()
    const f2         = fields.getTextInputValue("fc_f2").trim()
    const ss         = fields.getTextInputValue("fc_ss").trim().toLowerCase() === "ya"

    // Validate fc_durasi — only digits and "/" are allowed
    if (rawDurasi && !/^\d+(\/\d+)?$/.test(rawDurasi)) {
        await interaction.reply({
            content: "❌ Format durasi tidak valid. Gunakan angka saja, contoh: `30/24` atau `0`.",
            flags: MessageFlags.Ephemeral,
        })
        return
    }

    // Parse "warrantyDays/registrationHours" — e.g. "30/24" or just "30"
    const parts             = rawDurasi ? rawDurasi.split("/") : []
    const warrantyDays      = parts[0] ? Math.max(0, parseInt(parts[0], 10) || 0) : 0
    const registrationHours = parts[1] ? Math.max(1, parseInt(parts[1], 10) || 24) : 24

    setProductForm(productId, {
        enabled,
        warrantyDays,
        registrationHours,
        field1Label: f1,
        field2Label: f2,
        requireScreenshot: ss,
    })

    const activeFields = [f1, f2].filter(Boolean)

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle("✅ Form Garansi Disimpan")
                .setDescription(
                    `**Status:** ${enabled ? "✅ Aktif" : "⬜ Nonaktif"}\n` +
                    `**Durasi Garansi:** ${warrantyDays > 0 ? `${warrantyDays} hari` : "Tidak ada batas"}\n` +
                    `**Window Registrasi:** ${registrationHours} jam\n` +
                    `**Field Aktif:** ${activeFields.length > 0 ? activeFields.map(f => `\`${f}\``).join(", ") : "—"}\n` +
                    `**Wajib Screenshot:** ${ss ? "Ya" : "Tidak"}`
                )
                .setColor(Colors.Green),
        ],
        flags: MessageFlags.Ephemeral,
    })
    PrettyLog.success(`[FormConfig] Form garansi diupdate untuk produk ${productId}`)
}
