/* Developer: BANGDET.MD */
import {
    Client,
    EmbedBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
} from "discord.js"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getShops } from "./database/shops-database.js"
import { getSetting } from "@/features/settings/database/settings-handler.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { nanoid } from "nanoid"

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const PANELS_FILE = path.join(__dirname, "..", "..", "..", "data", "panels.json")

export interface PanelRecord {
    id:               string
    messageId:        string
    channelId:        string
    guildId:          string
    title:            string
    description:      string
    color:            number
    setupMessageId?:  string
    setupChannelId?:  string
}

let panels: PanelRecord[] = []

// ─── Persistence ────────────────────────────────────────────────────────────

async function loadPanels(): Promise<void> {
    try {
        const raw = await fs.readFile(PANELS_FILE, "utf-8")
        panels = JSON.parse(raw)
    } catch {
        panels = []
    }
}

async function savePanels(): Promise<void> {
    await fs.writeFile(PANELS_FILE, JSON.stringify(panels, null, 4))
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getPanelById(id: string): PanelRecord | undefined {
    return panels.find(p => p.id === id)
}

export function getPanelsForGuild(guildId: string): PanelRecord[] {
    return panels.filter(p => p.guildId === guildId)
}

export async function registerPanel(record: Omit<PanelRecord, "id">): Promise<PanelRecord> {
    await loadPanels()
    panels = panels.filter(p => !(p.channelId === record.channelId && p.guildId === record.guildId))
    const newPanel: PanelRecord = { id: nanoid(), ...record }
    panels.push(newPanel)
    await savePanels()
    PrettyLog.info(`[PanelRegistry] Panel registered: channel=${record.channelId} guild=${record.guildId}`)
    return newPanel
}

export async function updatePanelConfig(
    panelId: string,
    settings: Partial<Pick<PanelRecord, "title" | "description" | "color">>
): Promise<PanelRecord | null> {
    await loadPanels()
    const idx = panels.findIndex(p => p.id === panelId)
    if (idx === -1) return null

    panels[idx] = { ...panels[idx], ...settings }
    await savePanels()
    return panels[idx]
}

export async function linkSetupPanel(panelId: string, setupMessageId: string, setupChannelId: string): Promise<void> {
    await loadPanels()
    const panel = panels.find(p => p.id === panelId)
    if (!panel) return
    panel.setupMessageId = setupMessageId
    panel.setupChannelId = setupChannelId
    await savePanels()
}

// ─── Build Helpers ──────────────────────────────────────────────────────────

function buildShopRow(): ActionRowBuilder<StringSelectMenuBuilder> | null {
    const shops = getShops()
    if (!shops.size) return null

    const shopList = Array.from(shops.values()).slice(0, 25)

    const menu = new StringSelectMenuBuilder()
        .setCustomId("panelshop-select-shop")
        .setPlaceholder("🛍️ Pilih Kategori Toko...")
        .addOptions(
            shopList.map(shop =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${shop.emoji ? shop.emoji + " " : ""}${shop.name}`)
                    .setDescription(
                        shop.description.length > 100
                            ? shop.description.slice(0, 97) + "..."
                            : shop.description
                    )
                    .setValue(shop.id)
            )
        )

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)
}

export function buildSetupEmbed(panel: PanelRecord): EmbedBuilder {
    const hexColor = `#${panel.color.toString(16).toUpperCase().padStart(6, "0")}`

    const txSetting      = getSetting("logChannelId")
    const waSetting      = getSetting("warrantyLogChannelId")
    const claimSetting   = getSetting("claimChannelId")
    const rolesSetting   = getSetting("claimAdminRoles")
    const txChannelText  = txSetting?.value    ? `<#${txSetting.value}>`    : "`Belum diset`"
    const waChannelText  = waSetting?.value    ? `<#${waSetting.value}>`    : "`Belum diset`"
    const claimChText    = claimSetting?.value ? `<#${claimSetting.value}>` : "`Belum diset`"
    const rolesText      = rolesSetting?.value
        ? String(rolesSetting.value).split(",").map(r => r.trim()).filter(Boolean).map(r => `<@&${r}>`).join(", ")
        : "`Belum diset`"

    return new EmbedBuilder()
        .setTitle("⚙️ Panel Setup")
        .setDescription(
            `> Kelola tampilan **Shop Panel** yang tersinkron ke <#${panel.channelId}>.\n` +
            `> Setiap perubahan akan otomatis diupdate ke panel shop tersebut.\n\u200b`
        )
        .setColor(panel.color)
        .addFields(
            { name: "📌 Judul",             value: `\`\`\`${panel.title}\`\`\``,       inline: false },
            { name: "📝 Deskripsi",         value: `\`\`\`${panel.description}\`\`\``, inline: false },
            { name: "🎨 Warna",             value: `\`${hexColor}\``,                  inline: true  },
            { name: "📍 Panel Shop",        value: `<#${panel.channelId}>`,            inline: true  },
            { name: "📊 Log Transaksi",     value: txChannelText,                      inline: true  },
            { name: "🛡️ Log Garansi",       value: waChannelText,                      inline: true  },
            { name: "🎫 Channel Komplain",  value: claimChText,                        inline: true  },
            { name: "👮 Admin Komplain",    value: rolesText,                          inline: true  },
        )
        .setFooter({ text: `Panel ID: ${panel.id}` })
        .setTimestamp()
}

export function buildSetupRows(panelId: string): ActionRowBuilder<StringSelectMenuBuilder>[] {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`panelsetup-menu+${panelId}`)
        .setPlaceholder("⚙️ Panel Settings — choose an action...")
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Edit Panel")
                .setDescription("Edit the panel title, description and color")
                .setValue("edit")
                .setEmoji({ name: "message", id: "1415145253563793550", animated: true }),
            new StringSelectMenuOptionBuilder()
                .setLabel("Sync Now")
                .setDescription("Sync the panel embed to the latest config")
                .setValue("sync")
                .setEmoji({ name: "det_ceklis", id: "1043153592783224864", animated: true }),
            new StringSelectMenuOptionBuilder()
                .setLabel("Add Stock")
                .setDescription("Upload new stock items to a product")
                .setValue("stock")
                .setEmoji({ name: "bongocat_game", id: "1416048328713572565", animated: true }),
            new StringSelectMenuOptionBuilder()
                .setLabel("Log Channel")
                .setDescription("Set the transaction and warranty log channels")
                .setValue("log")
                .setEmoji({ name: "gear_s", id: "1416048326700433408", animated: true }),
            new StringSelectMenuOptionBuilder()
                .setLabel("Warranty Form")
                .setDescription("Configure the warranty form for each product")
                .setValue("form")
                .setEmoji({ name: "det_events", id: "1043167485521834045", animated: true }),
            new StringSelectMenuOptionBuilder()
                .setLabel("Panel Complaint")
                .setDescription("Set up the complaint ticket channel and admin roles")
                .setValue("claim")
                .setEmoji({ name: "Det_ticket", id: "1043151021607759923", animated: true }),
        )

    return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
}

/** @deprecated gunakan buildSetupRows */
export function buildSetupRow(panelId: string): ActionRowBuilder<StringSelectMenuBuilder> {
    return buildSetupRows(panelId)[0]
}

// ─── Sync Logic ──────────────────────────────────────────────────────────────

async function syncShopPanel(client: Client, panel: PanelRecord): Promise<boolean> {
    try {
        const row = buildShopRow()
        if (!row) return false

        const guild   = await client.guilds.fetch(panel.guildId)
        const channel = await guild.channels.fetch(panel.channelId)
        if (!channel || !channel.isTextBased()) return false

        const message = await channel.messages.fetch(panel.messageId)

        const embed = new EmbedBuilder()
            .setTitle(panel.title)
            .setDescription(panel.description)
            .setColor(panel.color)
            .setFooter({ text: "Pilih kategori toko di bawah untuk melihat produk" })
            .setTimestamp()

        await message.edit({ embeds: [embed], components: [row] })
        return true
    } catch {
        return false
    }
}

async function refreshSetupPanel(client: Client, panel: PanelRecord): Promise<void> {
    if (!panel.setupMessageId || !panel.setupChannelId) return
    try {
        const guild   = await client.guilds.fetch(panel.guildId)
        const channel = await guild.channels.fetch(panel.setupChannelId)
        if (!channel || !channel.isTextBased()) return

        const message = await channel.messages.fetch(panel.setupMessageId)
        await message.edit({
            embeds:     [buildSetupEmbed(panel)],
            components: buildSetupRows(panel.id),
        })
    } catch {
        // Setup panel message may have been deleted — not critical
    }
}

export async function syncPanelById(client: Client, panelId: string): Promise<boolean> {
    await loadPanels()
    const panel = panels.find(p => p.id === panelId)
    if (!panel) return false

    const ok = await syncShopPanel(client, panel)
    await refreshSetupPanel(client, panel)
    return ok
}

export async function syncAllPanels(client: Client): Promise<void> {
    await loadPanels()
    if (!panels.length) return

    const row = buildShopRow()
    if (!row) {
        PrettyLog.warn("[PanelSync] Tidak ada toko — sync dilewati")
        return
    }

    const validPanels: PanelRecord[] = []
    let synced = 0

    for (const panel of panels) {
        const ok = await syncShopPanel(client, panel)
        if (ok) {
            await refreshSetupPanel(client, panel)
            validPanels.push(panel)
            synced++
        } else {
            PrettyLog.warn(`[PanelSync] Panel ${panel.id} (ch: ${panel.channelId}) tidak ditemukan — dihapus dari registry`)
        }
    }

    panels = validPanels
    await savePanels()

    PrettyLog.info(`[PanelSync] ${synced} panel berhasil disync`)
}
