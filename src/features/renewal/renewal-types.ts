/* Developer: BANGDET.MD */
export interface RenewalConfig {
    enabled: boolean
    notifyChannelId?: string
    notifyRoles?: string
}

export type RenewalConfigsDB = Record<string, RenewalConfig>

export type RenewalStatus =
    | "watching"
    | "admin-notified"
    | "admin-approved"
    | "buyer-notified"
    | "buyer-declined"
    | "admin-rejected"
    | "payment-pending"
    | "completed"
    | "no-response"

export interface RenewalRecord {
    orderId: string
    userId: string
    productId: string
    productName: string
    shopId: string
    shopName: string
    guildId: string
    warrantyExpiresAt: string
    status: RenewalStatus
    isManual: boolean
    adminNotifiedAt?: string
    adminChannelId?: string
    adminMessageId?: string
    buyerNotifiedAt?: string
    durationDays?: 30 | 60 | 90
    renewalOrderId?: string
    renewalAmount?: number
    paymentCreatedAt?: string
    completedAt?: string
    cleanupAt?: string
    createdAt: string
}

export type RenewalTrackingDB = Record<string, RenewalRecord>
