/* Developer: BANGDET.MD */
import {
    ButtonInteraction,
    MessageComponentInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
} from "discord.js"
import {
    getPanelById,
    updatePanelConfig,
    buildSetupEmbed,
    buildSetupRows,
    syncPanelById,
} from "./panel-registry.js"
import {
    handleLogChannelSetup,
    handleClaimSetup,
    handleFormSetupButton,
    handleClaimModalSubmit,
} from "@/features/warranty/form-setup-handler.js"
import { handleStockAddFromButton } from "@/features/shops/stock-handler.js"
import { PrettyLog } from "@/lib/pretty-log.js"

export { handleClaimSetup, handleClaimModalSubmit }

// ─── Select Menu dispatcher ──────────────────────────────────────────────────
export async function handleSetupSelectMenu(interaction: StringSelectMenuInteraction, panelId: string): Promise<void> {
    const value = interaction.values[0]
    switch (value) {
        case "edit":  return handleSetupEdit(interaction, panelId)
        case "sync":  return handleSetupSync(interaction, panelId)
        case "stock": return handleStockAddFromButton(interaction)
        case "log":   return handleLogChannelSetup(interaction, panelId)
        case "form":  return handleFormSetupButton(interaction)
        case "claim": return handleClaimSetup(interaction, panelId)
    }
}

// ─── Edit Panel (gabungan Judul + Deskripsi + Warna) ─────────────────────────
export async function handleSetupEdit(interaction: MessageComponentInteraction, panelId: string): Promise<void> {
    const panel = getPanelById(panelId)
    if (!panel) {
        await interaction.reply({ content: "❌ Panel tidak ditemukan.", flags: MessageFlags.Ephemeral })
        return
    }

    const currentHex = `#${panel.color.toString(16).toUpperCase().padStart(6, "0")}`

    const modal = new ModalBuilder()
        .setCustomId(`panelsetup-modal-edit+${panelId}`)
        .setTitle("Edit Panel Shop")

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("title")
                .setLabel("Judul Panel")
                .setStyle(TextInputStyle.Short)
                .setValue(panel.title)
                .setMaxLength(256)
                .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("desc")
                .setLabel("Deskripsi Panel")
                .setStyle(TextInputStyle.Paragraph)
                .setValue(panel.description)
                .setMaxLength(4000)
                .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("color")
                .setLabel("Warna Hex (contoh: #FF5733)")
                .setStyle(TextInputStyle.Short)
                .setValue(currentHex)
                .setMinLength(4)
                .setMaxLength(7)
                .setRequired(true)
        ),
    )

    await interaction.showModal(modal)
}

// ─── Modal Submit: Edit (gabungan) ───────────────────────────────────────────
export async function handleSetupEditSubmit(interaction: ModalSubmitInteraction, panelId: string): Promise<void> {
    const newTitle = interaction.fields.getTextInputValue("title").trim()
    const newDesc  = interaction.fields.getTextInputValue("desc").trim()
    const rawColor = interaction.fields.getTextInputValue("color").trim()
    const parsed   = parseInt(rawColor.replace("#", ""), 16)

    if (isNaN(parsed)) {
        await interaction.reply({ content: "❌ Format warna tidak valid. Gunakan hex seperti `#FF5733`.", flags: MessageFlags.Ephemeral })
        return
    }

    await interaction.deferUpdate()

    const updated = await updatePanelConfig(panelId, { title: newTitle, description: newDesc, color: parsed })
    if (!updated) {
        await interaction.followUp({ content: "❌ Panel tidak ditemukan.", flags: MessageFlags.Ephemeral })
        return
    }

    await syncPanelById(interaction.client, panelId)

    await interaction.editReply({
        embeds:     [buildSetupEmbed(updated)],
        components: buildSetupRows(panelId),
    })

    PrettyLog.success(`[PanelSetup] Judul/Deskripsi/Warna diupdate (panel ${panelId})`)
}

// ─── Button: Sync Sekarang ───────────────────────────────────────────────────
export async function handleSetupSync(interaction: MessageComponentInteraction, panelId: string): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const ok = await syncPanelById(interaction.client, panelId)

    if (ok) {
        await interaction.editReply({ content: "✅ Panel shop berhasil disinkronkan!" })
    } else {
        await interaction.editReply({ content: "❌ Gagal sync — panel shop mungkin sudah dihapus." })
    }
}
