/* Developer: BANGDET.MD */
import { getCurrencies } from "@/features/currencies/database/currencies-database.js"
import { assertNeverReached } from "@/lib/error-handling.js"
import { t } from "@/lib/localization.js"
import { PrettyLog } from "@/lib/pretty-log.js"
import { ExtendedButtonComponent } from "@/ui-components/button.js"
import { ExtendedComponent } from "@/ui-components/extended-components.js"
import { ObjectValues, PaginatedMultipleEmbedUserInterface, UserInterfaceInteraction } from "@/user-interfaces/user-interfaces.js"
import {
    APIEmbedField, ButtonInteraction, ButtonStyle, Colors, ComponentType, EmbedBuilder,
    InteractionCallbackResponse, MessageComponentInteraction, ReadonlyCollection,
    StringSelectMenuBuilder, StringSelectMenuInteraction, StringSelectMenuOptionBuilder, User,
} from "discord.js"
import { getOrCreateAccount } from "../database/accounts-database.js"
import { Account } from "../database/accounts-type.js"
import { getUserPurchaseHistory, getWarrantySubmission, getClaimTickets } from "@/features/warranty/warranty-database.js"
import { PurchaseRecord } from "@/features/warranty/warranty-types.js"
import { isRenewalEnabled, getActiveRenewalForOrder } from "@/features/renewal/renewal-database.js"
import { handleSelfServiceRenewalRequest } from "@/features/renewal/renewal-flow.js"

// ── Inline select menu component for renewal orders ───────────────────────────
// Shown when there are >MAX_RENEWAL_BUTTONS eligible orders so all are reachable
class RenewalOrderSelectMenu extends ExtendedComponent {
    componentType = ComponentType.StringSelect
    customId = "renewal-order-select"
    time: number
    protected component: StringSelectMenuBuilder
    protected callback: (interaction: MessageComponentInteraction) => void

    constructor(
        orders: PurchaseRecord[],
        onSelect: (interaction: StringSelectMenuInteraction, orderId: string) => void,
        time: number
    ) {
        super()
        this.time = time
        this.callback = (interaction: MessageComponentInteraction) => {
            if (!interaction.isStringSelectMenu()) return
            const orderId = interaction.values[0]
            if (orderId) onSelect(interaction, orderId)
        }
        const options: StringSelectMenuOptionBuilder[] = orders.slice(0, 25).map(order => {
            const shortId = order.orderId.length > 8 ? "…" + order.orderId.slice(-8) : order.orderId
            return new StringSelectMenuOptionBuilder()
                .setLabel(`🔄 ${order.productName.substring(0, 80)} (${shortId})`)
                .setValue(order.orderId)
        })
        this.component = new StringSelectMenuBuilder()
            .setCustomId(this.customId)
            .setPlaceholder("Pilih order untuk ajukan renewal...")
            .addOptions(options)
    }

    protected onCollect(interaction: MessageComponentInteraction): void {
        this.callback(interaction)
    }

    protected onEnd(_collected: ReadonlyCollection<string, MessageComponentInteraction>): void {}
}

export class AccountUserInterface extends PaginatedMultipleEmbedUserInterface {
    public override id: string = 'account-ui'
    protected override components: Map<string, ExtendedComponent> = new Map()
    
    protected override readonly modes = {
        CURRENCIES:'currencies',
        INVENTORY: 'inventory'
    } as const
    
    protected override mode: ObjectValues<typeof this.modes> = this.modes.CURRENCIES
    
    protected override embed: EmbedBuilder | null = null
    protected override embedByMode: Map<ObjectValues<typeof this.modes>, EmbedBuilder> = new Map()

    protected override page: number = 0
    
    protected override response: InteractionCallbackResponse | null = null

    private user: User
    private account: Account | null = null
    private purchaseHistory: PurchaseRecord[] = []
    private eligibleRenewalOrders: PurchaseRecord[] = []

    private locale = "userInterfaces.account" as const

    constructor(user: User) {
        super()
        this.user = user
    }

    protected override async predisplay(_interaction: UserInterfaceInteraction) {
        this.account = await getOrCreateAccount(this.user.id)
        this.purchaseHistory = getUserPurchaseHistory(this.user.id)
        this.eligibleRenewalOrders = this._computeEligibleRenewalOrders()
    }

    private _computeEligibleRenewalOrders(): PurchaseRecord[] {
        const tickets    = getClaimTickets()
        const now        = Date.now()
        const eligible: PurchaseRecord[] = []

        for (const record of this.purchaseHistory) {
            const submission = getWarrantySubmission(record.orderId)
            if (!submission?.warrantyExpiresAt) continue
            if (!isRenewalEnabled(submission.productId)) continue

            const expiry = new Date(submission.warrantyExpiresAt).getTime()
            if (expiry <= now) continue

            const hasOpenClaim = Object.values(tickets).some(
                t => t.orderId === record.orderId && t.status === "open"
            )
            if (hasOpenClaim) continue

            const activeRenewal = getActiveRenewalForOrder(record.orderId)
            if (activeRenewal) continue

            eligible.push(record)
        }

        return eligible
    }

    protected override getMessage(): string {
        return ''
    }

    protected override initEmbeds(interaction: UserInterfaceInteraction): void {
        this.mode = this.modes.CURRENCIES
        const totalCurrencies = this.account?.currencies.size ?? 0
        const currenciesEmbed = new EmbedBuilder()
            .setTitle(`💰 Saldo — ${this.user.displayName}`)
            .setDescription(
                totalCurrencies > 0
                    ? `Berikut adalah saldo kamu di toko ini.\n\u200b`
                    : `Kamu belum memiliki saldo apa pun.\nSaldo akan bertambah setelah kamu bertransaksi.\n\u200b`
            )
            .setColor(Colors.Gold)
            .setThumbnail(this.user.displayAvatarURL())
            .setFooter({ text: 'BangDet Store', iconURL: interaction.client.user.displayAvatarURL()})
            .setTimestamp()
            .setFields(this.getPageEmbedFields())

        this.mode = this.modes.INVENTORY
        const totalItems = this.account?.inventory.size ?? 0
        const totalQty   = this._totalInventoryQty()
        const inventoryEmbed = new EmbedBuilder()
            .setTitle(`📦 Inventaris — ${this.user.displayName}`)
            .setDescription(
                totalItems > 0
                    ? `Kamu memiliki **${totalItems}** jenis produk (total **${totalQty}x** unit).\n` +
                      `Ini adalah produk yang pernah kamu beli di toko ini.\n\u200b`
                    : `Kamu belum pernah membeli produk apa pun.\nBeli produk dari shop panel untuk mulai!\n\u200b`
            )
            .setColor(0x2b7a78)
            .setThumbnail(this.user.displayAvatarURL())
            .setFooter({ text: 'BangDet Store', iconURL: interaction.client.user.displayAvatarURL()})
            .setTimestamp()
            .setFields(this.getPageEmbedFields())

        this.embedByMode.set(this.modes.CURRENCIES, currenciesEmbed)
        this.embedByMode.set(this.modes.INVENTORY, inventoryEmbed)

        this.embed = currenciesEmbed

        this.mode = this.modes.CURRENCIES
    }

    protected override updateEmbeds(): void {
        const currentModeEmbed = this.embedByMode.get(this.mode)
        if (!currentModeEmbed) return

        currentModeEmbed.setFields(this.getPageEmbedFields())
        this.embed = currentModeEmbed
    }

    protected override initComponents(): void {
        const showAccountButton = new ExtendedButtonComponent(
            {
                customId: `${this.id}+show-account`,
                label: t(`${this.locale}.components.showAccountButton`),
                emoji: {name: '👤'},
                style: ButtonStyle.Secondary,
                disabled: this.mode == this.modes.CURRENCIES,
                time: 120_000
            }, 
            (interaction: ButtonInteraction) => this.changeDisplayMode(interaction, this.modes.CURRENCIES)
        )

        const showInventoryButton = new ExtendedButtonComponent(
            {
                customId: `${this.id}+show-inventory`,
                label: t(`${this.locale}.components.showInventoryButton`),
                emoji: {name: '📦'},
                style: ButtonStyle.Primary,
                disabled: this.mode == this.modes.INVENTORY,
                time: 120_000
            }, 
            (interaction: ButtonInteraction) => this.changeDisplayMode(interaction, this.modes.INVENTORY)
        )

        this.components.set(showAccountButton.customId, showAccountButton)
        this.components.set(showInventoryButton.customId, showInventoryButton)
    }

    // Max buttons that fit in the account row alongside the 2 nav buttons (Discord limit: 5/row)
    private static readonly MAX_RENEWAL_BUTTONS = 3

    private _clearRenewalComponents(): void {
        for (const key of this.components.keys()) {
            if (key.startsWith('renewal-req+') || key === 'renewal-order-select') {
                this.components.get(key)?.destroyCollector()
                this.components.delete(key)
            }
        }
    }

    private _addRenewalComponents(): void {
        const orders = this.eligibleRenewalOrders
        if (!orders.length) return

        if (orders.length <= AccountUserInterface.MAX_RENEWAL_BUTTONS) {
            // Few enough: show individual buttons in the nav row
            for (const order of orders) {
                const orderId = order.orderId
                const shortId = orderId.length > 8 ? orderId.substring(orderId.length - 8) : orderId
                const btn = new ExtendedButtonComponent(
                    {
                        customId: `renewal-req+${orderId}`,
                        label: `🔄 Renewal …${shortId}`,
                        style: ButtonStyle.Success,
                        time: 120_000,
                    },
                    (interaction: ButtonInteraction) => {
                        handleSelfServiceRenewalRequest(interaction, orderId).catch(e => {
                            PrettyLog.error(`[Renewal] Self-service error: ${e}`)
                        })
                    }
                )
                this.components.set(btn.customId, btn)
                if (this.response) btn.createCollector(this.response)
            }
        } else {
            // Many orders: use a select menu (fits all up to 25, uses only 1 row)
            const selectMenu = new RenewalOrderSelectMenu(
                orders,
                (interaction: StringSelectMenuInteraction, orderId: string) => {
                    handleSelfServiceRenewalRequest(interaction, orderId).catch(e => {
                        PrettyLog.error(`[Renewal] Self-service error: ${e}`)
                    })
                },
                120_000
            )
            this.components.set(selectMenu.customId, selectMenu)
            if (this.response) selectMenu.createCollector(this.response)
        }
    }

    protected override updateComponents(): void {
        const showAccountButton = this.components.get(`${this.id}+show-account`)
        if (showAccountButton instanceof ExtendedButtonComponent) {
            showAccountButton.toggle(this.mode != this.modes.CURRENCIES)
        }

        const showInventoryButton = this.components.get(`${this.id}+show-inventory`)
        if (showInventoryButton instanceof ExtendedButtonComponent) {
            showInventoryButton.toggle(this.mode != this.modes.INVENTORY)
        }

        this._clearRenewalComponents()

        if (this.mode === this.modes.INVENTORY && this.eligibleRenewalOrders.length > 0) {
            this._addRenewalComponents()
        }
    }

    protected override getInputSize(): number {
        switch (this.mode) {
            case this.modes.CURRENCIES:
                return getCurrencies().size
            case this.modes.INVENTORY:
                return this.account?.inventory.size ?? 0
        }
    }

    private _totalInventoryQty(): number {
        if (!this.account) return 0
        let total = 0
        this.account.inventory.forEach(b => { total += b.amount })
        return total
    }

    private getAccountFields(): APIEmbedField[] {
        if (!this.account || !this.account.currencies.size) {
            return [{
                name: '❌ Saldo Kosong',
                value: 'Kamu belum memiliki saldo apa pun di toko ini.',
                inline: false,
            }]
        }
        const fields: APIEmbedField[] = []

        this.account.currencies.forEach(currencyBalance => {
            const emojiString = currencyBalance.item.emoji != null ? `${currencyBalance.item.emoji} ` : '💵 '
            fields.push({
                name: `${emojiString}${currencyBalance.item.name}`,
                value: `\`\`\`${currencyBalance.amount.toLocaleString('id-ID')}\`\`\``,
                inline: true,
            })
        })

        return fields
    }

    private getInventoryFields(): APIEmbedField[] { 
        if (!this.account || !this.account.inventory.size) {
            return [{
                name: '📭 Inventaris Kosong',
                value: 'Kamu belum memiliki produk apa pun.\nBeli produk dari shop panel untuk mulai!',
                inline: false,
            }]
        }
        const fields: APIEmbedField[] = []

        this.account.inventory.forEach((productBalance, productId) => {
            const emojiString = productBalance.item.emoji != null ? `${productBalance.item.emoji}` : '📦'

            // Find all orders for this product
            const orders = this.purchaseHistory.filter(r => r.productId === productId)

            let orderLines = ''
            for (const order of orders) {
                const submission = getWarrantySubmission(order.orderId)
                let warrantyLine: string
                if (!submission) {
                    warrantyLine = '⏳ Belum daftar garansi'
                } else if (!submission.warrantyExpiresAt) {
                    warrantyLine = '♾️ Garansi: Tidak ada batas'
                } else {
                    const expiryTs = Math.floor(new Date(submission.warrantyExpiresAt).getTime() / 1000)
                    warrantyLine = `🛡️ Garansi: <t:${expiryTs}:D> (<t:${expiryTs}:R>)`
                }
                orderLines += `> \`${order.orderId}\`\n> ${warrantyLine}\n`
            }

            if (!orderLines) orderLines = '> —'

            fields.push({
                name: `${emojiString} ${productBalance.item.name}`,
                value: `> **Jumlah:** ${productBalance.amount}x\n${orderLines}`,
                inline: false,
            })
        })

        return fields
    }

    protected override getEmbedFields(): APIEmbedField[] {
        switch (this.mode) {
            case this.modes.CURRENCIES:
                return this.getAccountFields()
            case this.modes.INVENTORY:
                return this.getInventoryFields()
            default:
                assertNeverReached(this.mode)
        }
    }
}
