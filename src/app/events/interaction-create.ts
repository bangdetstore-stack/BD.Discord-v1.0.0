/* Developer: BANGDET.MD */
import { handlePaymentCancel } from "@/features/payment/payment-flow.js"
import { 
    handlePanelShopSelect,
    handlePanelProductSelect,
    handlePanelBuy,
    handlePanelBackToProducts,
} from "@/features/shops/panel-shop-handler.js"
import {
    handleSetupSelectMenu,
    handleSetupEdit,
    handleSetupEditSubmit,
    handleSetupSync,
    handleClaimSetup,
    handleClaimModalSubmit,
} from "@/features/shops/panel-setup-handler.js"
import {
    handleStockAddFromButton,
    handleStockAddShopSelect,
    handleStockAddProductSelect,
    handleStockAddModalSubmit,
    handleStockClearShopSelect,
    handleStockClearProductSelect,
    handleStockClearConfirm,
    handleStockClearCancel,
} from "@/features/shops/stock-handler.js"
import {
    handleWarrantyFillButton,
    handleWarrantyModalSubmit,
} from "@/features/warranty/warranty-flow.js"
import {
    handleLogChannelSetup,
    handleLogChannelModalSubmit,
    handleFormSetupButton,
    handleFormSetupShopSelect,
    handleFormSetupProductSelect,
    handleFormConfigModalSubmit,
} from "@/features/warranty/form-setup-handler.js"
import {
    handleClaimButton,
    handleClaimOrderSelect,
} from "@/features/warranty/claim-handler.js"
import { handleRenewalButtonInteraction } from "@/features/renewal/renewal-flow.js"
import { replyErrorMessage } from "@/lib/discord.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { ActivityLog } from "@/lib/activity-log.js"
import {
    Events,
    BaseInteraction,
    InteractionType,
    ChatInputCommandInteraction,
    ChannelType,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    MessageFlags,
} from "discord.js"


export const name = Events.InteractionCreate

// ── Admin-only component guard ─────────────────────────────────────────────────
// CustomId prefixes that belong exclusively to admin features.
// Any component interaction matching these prefixes is silently blocked
// for members without the Administrator permission.
const ADMIN_BUTTON_PREFIXES  = ["panelsetup-", "stock-clear-"]
const ADMIN_SELECT_PREFIXES  = ["panelsetup-", "stock-add-select-", "stock-clear-select-", "formconfig-select-"]
const ADMIN_MODAL_PREFIXES   = ["panelsetup-modal-", "stock-modal-", "setup-modal-log", "setup-modal-claim", "formconfig-modal"]

async function rejectIfNotAdmin(
    interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
    prefixes: string[],
): Promise<boolean> {
    const id = interaction.customId
    if (!prefixes.some(p => id.startsWith(p))) return false
    const isAdmin = interaction.memberPermissions?.has("Administrator") ?? false
    if (isAdmin) return false
    PrettyLog.warn(`[Security] Non-admin user ${interaction.user.username} (${interaction.user.id}) attempted admin action: ${id}`)
    await interaction.reply({
        content: "❌ You don't have permission to use this feature.",
        flags: MessageFlags.Ephemeral,
    }).catch(() => {})
    return true
}

export async function execute(interaction: BaseInteraction) {
    if (interaction.user.bot) return
    
    if (interaction.isChatInputCommand()) {
        handleSlashCommand(interaction)
        return
    }

    if (interaction.isButton()) {
        ActivityLog.button({
            username:  interaction.user.username,
            userId:    interaction.user.id,
            channelId: interaction.channelId,
            guildName: interaction.guild?.name ?? "Unknown Server",
            buttonId:  interaction.customId,
        })
        handleButtonInteraction(interaction)
        return
    }

    if (interaction.isStringSelectMenu()) {
        ActivityLog.menu({
            username:  interaction.user.username,
            userId:    interaction.user.id,
            channelId: interaction.channelId,
            guildName: interaction.guild?.name ?? "Unknown Server",
            menuId:    interaction.customId,
            selected:  interaction.values.join(", "),
        })
        handleSelectMenuInteraction(interaction)
        return
    }

    if (interaction.isModalSubmit()) {
        handleModalSubmit(interaction)
        return
    }
}


async function handleSlashCommand(interaction: ChatInputCommandInteraction) {
    const command = interaction.client.commands.get(interaction.commandName)
    if (!command) return
    if (interaction?.channel?.type === ChannelType.DM) return

    const guildName = interaction.guild?.name ?? "Unknown Server"
    const channelName = interaction.channel && "name" in interaction.channel
        ? (interaction.channel.name ?? interaction.channelId)
        : interaction.channelId

    ActivityLog.command({
        username:    interaction.user.username,
        userId:      interaction.user.id,
        channelName: channelName,
        channelId:   interaction.channelId,
        guildName:   guildName,
        command:     interaction.commandName,
    })

    try {
        await command.execute(interaction.client, interaction)
    } catch (error: unknown) {
        console.error(error)
        PrettyLog.error(`Gagal menjalankan command '/${interaction.commandName}' oleh ${interaction.user.username}`)
        await replyErrorMessage(interaction)
    }
}

async function handleButtonInteraction(interaction: ButtonInteraction) {
    if (await rejectIfNotAdmin(interaction, ADMIN_BUTTON_PREFIXES)) return
    const customId = interaction.customId

    // payment-cancel+{orderId}
    if (customId.startsWith("payment-cancel+")) {
        const orderId = customId.replace("payment-cancel+", "")
        try {
            await handlePaymentCancel(interaction, orderId)
        } catch (error) {
            PrettyLog.error(`[Payment] Failed to handle cancel button: ${error}`)
        }
        return
    }

    // panelshop-buy+{shopId}+{productId}
    if (customId.startsWith("panelshop-buy+")) {
        const parts = customId.replace("panelshop-buy+", "").split("+")
        const shopId    = parts[0]
        const productId = parts[1]
        if (shopId && productId) {
            try {
                await handlePanelBuy(interaction, shopId, productId)
            } catch (error) {
                PrettyLog.error(`[PanelShop] Failed to handle buy button: ${error}`)
            }
        }
        return
    }

    // panelshop-back-to-products+{shopId}
    if (customId.startsWith("panelshop-back-to-products+")) {
        const shopId = customId.replace("panelshop-back-to-products+", "")
        if (shopId) {
            try {
                await handlePanelBackToProducts(interaction, shopId)
            } catch (error) {
                PrettyLog.error(`[PanelShop] Failed to handle back button: ${error}`)
            }
        }
        return
    }

    // panelsetup-edit+{panelId} — tombol gabungan Edit Panel (judul + deskripsi + warna)
    if (customId.startsWith("panelsetup-edit+")) {
        const panelId = customId.replace("panelsetup-edit+", "")
        try { await handleSetupEdit(interaction, panelId) } catch (e) { PrettyLog.error(`[PanelSetup] ${e}`) }
        return
    }

    // panelsetup-sync+{panelId}
    if (customId.startsWith("panelsetup-sync+")) {
        const panelId = customId.replace("panelsetup-sync+", "")
        try { await handleSetupSync(interaction, panelId) } catch (e) { PrettyLog.error(`[PanelSetup] ${e}`) }
        return
    }

    // panelsetup-stock+{panelId}
    if (customId.startsWith("panelsetup-stock+")) {
        try { await handleStockAddFromButton(interaction) } catch (e) { PrettyLog.error(`[Stock] ${e}`) }
        return
    }

    // panelsetup-log+{panelId}
    if (customId.startsWith("panelsetup-log+")) {
        const panelId = customId.replace("panelsetup-log+", "")
        try { await handleLogChannelSetup(interaction, panelId) } catch (e) { PrettyLog.error(`[Setup] ${e}`) }
        return
    }

    // panelsetup-form+{panelId}
    if (customId.startsWith("panelsetup-form+")) {
        try { await handleFormSetupButton(interaction) } catch (e) { PrettyLog.error(`[FormSetup] ${e}`) }
        return
    }

    // warranty-fill+{orderId}
    if (customId.startsWith("warranty-fill+")) {
        const orderId = customId.replace("warranty-fill+", "")
        try { await handleWarrantyFillButton(interaction, orderId) } catch (e) { PrettyLog.error(`[Warranty] ${e}`) }
        return
    }

    // warranty-claim+{orderId}
    if (customId.startsWith("warranty-claim+")) {
        const orderId = customId.replace("warranty-claim+", "")
        try { await handleClaimButton(interaction, orderId) } catch (e) { PrettyLog.error(`[Claim] ${e}`) }
        return
    }

    // panelsetup-claim+{panelId}
    if (customId.startsWith("panelsetup-claim+")) {
        const panelId = customId.replace("panelsetup-claim+", "")
        try { await handleClaimSetup(interaction, panelId) } catch (e) { PrettyLog.error(`[ClaimSetup] ${e}`) }
        return
    }

    // stock-clear-confirm+{shopId}+{productId}
    if (customId.startsWith("stock-clear-confirm+")) {
        const parts = customId.replace("stock-clear-confirm+", "").split("+")
        if (parts[0] && parts[1]) {
            try { await handleStockClearConfirm(interaction, parts[0], parts[1]) } catch (e) { PrettyLog.error(`[Stock] ${e}`) }
        }
        return
    }

    // stock-clear-cancel
    if (customId === "stock-clear-cancel") {
        try { await handleStockClearCancel(interaction) } catch (e) { PrettyLog.error(`[Stock] ${e}`) }
        return
    }

    // renewal-* buttons (NOT renewal-req+ which is handled by account-ui ExtendedButtonComponent collector)
    if (customId.startsWith("renewal-") && !customId.startsWith("renewal-req+")) {
        try { await handleRenewalButtonInteraction(interaction) } catch (e) { PrettyLog.error(`[Renewal] ${e}`) }
        return
    }
}

async function handleSelectMenuInteraction(interaction: StringSelectMenuInteraction) {
    if (await rejectIfNotAdmin(interaction, ADMIN_SELECT_PREFIXES)) return
    const customId = interaction.customId

    // panelsetup-menu+{panelId} — panel setup dropdown
    if (customId.startsWith("panelsetup-menu+")) {
        const panelId = customId.replace("panelsetup-menu+", "")
        try { await handleSetupSelectMenu(interaction, panelId) } catch (e) { PrettyLog.error(`[PanelSetup] ${e}`) }
        return
    }

    // panelshop-select-shop
    if (customId === "panelshop-select-shop") {
        try {
            await handlePanelShopSelect(interaction)
        } catch (error) {
            PrettyLog.error(`[PanelShop] Failed to handle shop select: ${error}`)
        }
        return
    }

    // panelshop-select-product+{shopId}
    if (customId.startsWith("panelshop-select-product+")) {
        const shopId = customId.replace("panelshop-select-product+", "")
        if (shopId) {
            try {
                await handlePanelProductSelect(interaction, shopId)
            } catch (error) {
                PrettyLog.error(`[PanelShop] Failed to handle product select: ${error}`)
            }
        }
        return
    }

    // stock-add-select-shop
    if (customId === "stock-add-select-shop") {
        try { await handleStockAddShopSelect(interaction) } catch (e) { PrettyLog.error(`[Stock] ${e}`) }
        return
    }

    // stock-add-select-product+{shopId}
    if (customId.startsWith("stock-add-select-product+")) {
        const shopId = customId.replace("stock-add-select-product+", "")
        try { await handleStockAddProductSelect(interaction, shopId) } catch (e) { PrettyLog.error(`[Stock] ${e}`) }
        return
    }

    // formconfig-select-shop
    if (customId === "formconfig-select-shop") {
        try { await handleFormSetupShopSelect(interaction) } catch (e) { PrettyLog.error(`[FormSetup] ${e}`) }
        return
    }

    // formconfig-select-product+{shopId}
    if (customId.startsWith("formconfig-select-product+")) {
        const shopId = customId.replace("formconfig-select-product+", "")
        try { await handleFormSetupProductSelect(interaction, shopId) } catch (e) { PrettyLog.error(`[FormSetup] ${e}`) }
        return
    }

    // stock-clear-select-shop
    if (customId === "stock-clear-select-shop") {
        try { await handleStockClearShopSelect(interaction) } catch (e) { PrettyLog.error(`[Stock] ${e}`) }
        return
    }

    // stock-clear-select-product+{shopId}
    if (customId.startsWith("stock-clear-select-product+")) {
        const shopId = customId.replace("stock-clear-select-product+", "")
        try { await handleStockClearProductSelect(interaction, shopId) } catch (e) { PrettyLog.error(`[Stock] ${e}`) }
        return
    }

    // claim-select-order
    if (customId === "claim-select-order") {
        try { await handleClaimOrderSelect(interaction) } catch (e) { PrettyLog.error(`[Claim] ${e}`) }
        return
    }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction) {
    if (await rejectIfNotAdmin(interaction, ADMIN_MODAL_PREFIXES)) return
    const customId = interaction.customId

    // panelsetup-modal-edit+{panelId} — modal gabungan (judul + deskripsi + warna)
    if (customId.startsWith("panelsetup-modal-edit+")) {
        const panelId = customId.replace("panelsetup-modal-edit+", "")
        try { await handleSetupEditSubmit(interaction, panelId) } catch (e) { PrettyLog.error(`[PanelSetup] ${e}`) }
        return
    }

    // stock-modal-add+{shopId}+{productId}
    if (customId.startsWith("stock-modal-add+")) {
        const parts = customId.replace("stock-modal-add+", "").split("+")
        if (parts[0] && parts[1]) {
            try { await handleStockAddModalSubmit(interaction, parts[0], parts[1]) } catch (e) { PrettyLog.error(`[Stock] ${e}`) }
        }
        return
    }

    // setup-modal-log
    if (customId === "setup-modal-log") {
        try { await handleLogChannelModalSubmit(interaction) } catch (e) { PrettyLog.error(`[Setup] ${e}`) }
        return
    }

    // formconfig-modal+{productId}
    if (customId.startsWith("formconfig-modal+")) {
        const productId = customId.replace("formconfig-modal+", "")
        try { await handleFormConfigModalSubmit(interaction, productId) } catch (e) { PrettyLog.error(`[FormSetup] ${e}`) }
        return
    }

    // setup-modal-claim
    if (customId === "setup-modal-claim") {
        try { await handleClaimModalSubmit(interaction) } catch (e) { PrettyLog.error(`[ClaimSetup] ${e}`) }
        return
    }

    // warranty-modal+{orderId}
    if (customId.startsWith("warranty-modal+")) {
        const orderId = customId.replace("warranty-modal+", "")
        try { await handleWarrantyModalSubmit(interaction, orderId) } catch (e) { PrettyLog.error(`[Warranty] ${e}`) }
        return
    }
}
