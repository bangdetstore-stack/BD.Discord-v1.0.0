/* Developer: BANGDET.MD */
import { Pakasir } from "pakasir-sdk"
import { PrettyLog } from "@/lib/pretty-log.js"

let pakasirInstance: Pakasir | null = null

function getPakasir(): Pakasir {
    if (!pakasirInstance) {
        const project = process.env["PAKASIR_PROJECT"]
        const apiKey = process.env["PAKASIR_API_KEY"]

        if (!project || !apiKey) {
            throw new Error("Missing PAKASIR_PROJECT or PAKASIR_API_KEY in environment variables")
        }

        pakasirInstance = new Pakasir({
            slug: project,
            apikey: apiKey,
        })

        PrettyLog.logLoadStep("Pakasir payment gateway initialized")
    }

    return pakasirInstance
}

export interface PakasirPaymentResult {
    project: string
    order_id: string
    amount: number
    fee: number
    total_payment: number
    payment_method: string
    payment_number: string
    expired_at: string
}

export async function createQrisPayment(orderId: string, amount: number): Promise<PakasirPaymentResult> {
    const pakasir = getPakasir()
    const result = await pakasir.createPayment("qris", orderId, amount)

    return result as unknown as PakasirPaymentResult
}

export async function cancelPakasirPayment(orderId: string, amount: number): Promise<unknown> {
    const pakasir = getPakasir()
    return await pakasir.cancelPayment(orderId, amount)
}

export async function getPaymentDetail(orderId: string, amount: number): Promise<unknown> {
    const pakasir = getPakasir()
    return await pakasir.detailPayment(orderId, amount)
}
