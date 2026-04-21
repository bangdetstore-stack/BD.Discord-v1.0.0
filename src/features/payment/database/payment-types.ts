/* Developer: BANGDET.MD */
import { Snowflake } from "discord.js"
import { NanoId } from "@/database/database-types.js"

export interface PendingPayment {
    orderId: string
    userId: Snowflake
    shopId: NanoId
    productId: NanoId
    productName: string
    amount: number
    fee: number
    totalPayment: number
    paymentMethod: string
    paymentNumber: string
    status: "pending" | "completed" | "canceled" | "expired"
    createdAt: Date
    expiredAt: Date
    channelId: Snowflake
    guildId: Snowflake
    interactionToken?: string
    applicationId?: string
}
