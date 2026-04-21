/* Developer: BANGDET.MD */
export interface ProductFormConfig {
    enabled: boolean
    warrantyDays: number
    registrationHours: number
    field1Label: string
    field2Label: string
    requireScreenshot: boolean
}

export type ProductFormsDB = Record<string, ProductFormConfig>

export interface PendingWarranty {
    orderId: string
    userId: string
    productId: string
    productName: string
    shopId: string
    shopName: string
    purchasedAt: string
    reminderSent: boolean
    guildId: string
    registrationHours: number
}

export type PendingWarrantiesDB = Record<string, PendingWarranty>

export interface WarrantySubmission {
    orderId: string
    userId: string
    productId: string
    productName: string
    shopName: string
    submittedAt: string
    purchasedAt: string
    warrantyExpiresAt: string
    guildId: string
    field1?: string
    field2?: string
    screenshotUrl?: string
}

export type WarrantySubmissionsDB = Record<string, WarrantySubmission>

export interface PurchaseRecord {
    orderId: string
    productId: string
    productName: string
    shopId: string
    shopName: string
    purchasedAt: string
    guildId: string
}

export type PurchaseHistoryDB = Record<string, PurchaseRecord[]>

export interface ClaimTicket {
    ticketId: string
    orderId: string
    userId: string
    productName: string
    shopName: string
    threadId: string
    channelId: string
    guildId: string
    status: "open" | "closed"
    createdAt: string
    closedAt?: string
}

export type ClaimTicketsDB = Record<string, ClaimTicket>
