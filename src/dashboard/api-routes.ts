/* Developer: BANGDET.MD */
import { getShops, createShop, removeShop, updateShop, createDiscountCode, removeDiscountCode } from "@/features/shops/database/shops-database.js"
import { getCurrencies, createCurrency, removeCurrency, updateCurrency } from "@/features/currencies/database/currencies-database.js"
import { getProducts, addProduct, removeProduct, updateProduct } from "@/features/shops/database/products-database.js"
import { getOrCreateAccount, setAccountCurrencyAmount } from "@/features/accounts/database/accounts-database.js"
import { getSettings, setSetting } from "@/features/settings/database/settings-handler.js"
import { getAllPendingPayments } from "@/features/payment/database/payment-store.js"
import { Shop } from "@/features/shops/database/shops-types.js"
import { Product } from "@/features/shops/database/products-types.js"
import { IncomingMessage, ServerResponse } from "node:http"

// Helper: parse JSON body
function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        let body = ""
        req.on("data", (chunk: Buffer) => { body += chunk.toString() })
        req.on("end", () => {
            try { resolve(body ? JSON.parse(body) : {}) }
            catch { reject(new Error("Invalid JSON")) }
        })
    })
}

// Helper: send JSON response
function json(res: ServerResponse, data: unknown, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
    res.end(JSON.stringify(data))
}

function err(res: ServerResponse, message: string, status = 400) {
    json(res, { error: message }, status)
}

// Guard: require X-Dashboard-Token header only when DASHBOARD_SECRET env var is set.
// If DASHBOARD_SECRET is not set, all requests are allowed (open access).
function requireMutationAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const secret = process.env["DASHBOARD_SECRET"]
    if (!secret) return false  // no secret configured → open access

    const token = req.headers["x-dashboard-token"]
    if (token !== secret) {
        json(res, { error: "Unauthorized" }, 401)
        return true
    }
    return false
}

// Convert Map-based shop data to serializable object
function serializeShop(shop: Shop) {
    const products: Record<string, unknown>[] = []
    shop.products.forEach((p: Product) => {
        products.push({ ...p })
    })
    return {
        id: shop.id,
        name: shop.name,
        emoji: shop.emoji,
        description: shop.description,
        currency: shop.currency,
        discountCodes: shop.discountCodes,
        reservedTo: shop.reservedTo,
        products,
    }
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`)
    const path = url.pathname
    const method = req.method || "GET"

    // CORS preflight
    if (method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Dashboard-Token",
        })
        res.end()
        return true
    }

    // Auth guard: if DASHBOARD_SECRET is set, ALL requests (read + write) must carry X-Dashboard-Token.
    // GET endpoints expose sensitive data (stock, warranty, accounts) so they must be equally protected.
    if (requireMutationAuth(req, res)) return true

    // ========== STATS ==========
    if (path === "/api/stats" && method === "GET") {
        const shops = getShops()
        let totalProducts = 0
        shops.forEach(s => { totalProducts += s.products.size })
        const currencies = getCurrencies()
        const payments = getAllPendingPayments()

        // Count accounts from JSON directly
        let totalAccounts = 0
        try {
            const fs = await import("node:fs")
            const accountsRaw = fs.readFileSync("data/accounts.json", "utf-8")
            const accountsData = JSON.parse(accountsRaw)
            totalAccounts = Object.keys(accountsData).length
        } catch { totalAccounts = 0 }

        let totalPanels = 0
        let activeWarranties = 0
        let warrantySubmissions = 0
        let openClaimTickets = 0
        try {
            const fs2 = await import("node:fs")
            if (fs2.existsSync("data/panels.json")) {
                const p = JSON.parse(fs2.readFileSync("data/panels.json", "utf-8"))
                totalPanels = Array.isArray(p) ? p.length : 0
            }
            if (fs2.existsSync("data/pending-warranties.json")) {
                const pw = JSON.parse(fs2.readFileSync("data/pending-warranties.json", "utf-8"))
                activeWarranties = Object.keys(pw).length
            }
            if (fs2.existsSync("data/warranty-submissions.json")) {
                const ws = JSON.parse(fs2.readFileSync("data/warranty-submissions.json", "utf-8"))
                warrantySubmissions = Object.keys(ws).length
            }
            if (fs2.existsSync("data/claim-tickets.json")) {
                const ct = JSON.parse(fs2.readFileSync("data/claim-tickets.json", "utf-8"))
                openClaimTickets = Object.values(ct).filter((t: unknown) => (t as { status: string }).status === "open").length
            }
        } catch { /* silently ignore */ }

        json(res, {
            totalShops: shops.size,
            totalProducts,
            totalCurrencies: currencies.size,
            totalAccounts,
            pendingPayments: payments.size,
            totalPanels,
            activeWarranties,
            warrantySubmissions,
            openClaimTickets,
        })
        return true
    }

    // ========== SHOPS ==========
    if (path === "/api/shops" && method === "GET") {
        const shops = getShops()
        const result: unknown[] = []
        shops.forEach(shop => result.push(serializeShop(shop)))
        json(res, result)
        return true
    }

    if (path === "/api/shops" && method === "POST") {
        const body = await parseBody(req)
        const name = body["name"] as string
        const description = (body["description"] as string) || ""
        const currencyId = body["currencyId"] as string
        const emoji = (body["emoji"] as string) || ""
        if (!name || !currencyId) return err(res, "name and currencyId required"), true
        const [error, shop] = await createShop(name, description, currencyId, emoji)
        if (error) return err(res, error.message), true
        json(res, serializeShop(shop), 201)
        return true
    }

    const shopDeleteMatch = path.match(/^\/api\/shops\/(.+)$/)
    if (shopDeleteMatch && method === "DELETE") {
        const shopId = decodeURIComponent(shopDeleteMatch[1])
        const [error] = await removeShop(shopId)
        if (error) return err(res, error.message), true
        json(res, { success: true })
        return true
    }

    const shopUpdateMatch = path.match(/^\/api\/shops\/(.+)$/)
    if (shopUpdateMatch && method === "PUT") {
        const shopId = decodeURIComponent(shopUpdateMatch[1])
        const body = await parseBody(req)
        const [error] = await updateShop(shopId, body as Record<string, unknown>)
        if (error) return err(res, error.message), true
        json(res, { success: true })
        return true
    }

    // ========== CURRENCIES ==========
    if (path === "/api/currencies" && method === "GET") {
        const currencies = getCurrencies()
        const result: unknown[] = []
        currencies.forEach(c => result.push(c))
        json(res, result)
        return true
    }

    if (path === "/api/currencies" && method === "POST") {
        const body = await parseBody(req)
        const name = body["name"] as string
        const emoji = (body["emoji"] as string) || ""
        if (!name) return err(res, "name required"), true
        const [error, currency] = await createCurrency(name, emoji)
        if (error) return err(res, error.message), true
        json(res, currency, 201)
        return true
    }

    const currencyDeleteMatch = path.match(/^\/api\/currencies\/(.+)$/)
    if (currencyDeleteMatch && method === "DELETE") {
        const currencyId = decodeURIComponent(currencyDeleteMatch[1])
        const [error] = await removeCurrency(currencyId)
        if (error) return err(res, error.message), true
        json(res, { success: true })
        return true
    }

    const currencyUpdateMatch = path.match(/^\/api\/currencies\/(.+)$/)
    if (currencyUpdateMatch && method === "PUT") {
        const currencyId = decodeURIComponent(currencyUpdateMatch[1])
        const body = await parseBody(req)
        const [error] = await updateCurrency(currencyId, body as Record<string, unknown>)
        if (error) return err(res, error.message), true
        json(res, { success: true })
        return true
    }

    // ========== PRODUCTS ==========
    const productsGetMatch = path.match(/^\/api\/products\/([^/]+)$/)
    if (productsGetMatch && method === "GET") {
        const shopId = decodeURIComponent(productsGetMatch[1])
        const [error, products] = getProducts(shopId)
        if (error) return err(res, error.message), true
        const result: unknown[] = []
        products.forEach(p => result.push(p))
        json(res, result)
        return true
    }

    const productsAddMatch = path.match(/^\/api\/products\/([^/]+)$/)
    if (productsAddMatch && method === "POST") {
        const shopId = decodeURIComponent(productsAddMatch[1])
        const body = await parseBody(req)
        const [error, product] = await addProduct(shopId, {
            name: body["name"] as string,
            emoji: (body["emoji"] as string) || "",
            description: (body["description"] as string) || "",
            price: body["price"] as number,
            amount: body["amount"] as number | undefined,
        })
        if (error) return err(res, error.message), true
        json(res, product, 201)
        return true
    }

    const productUpdateMatch = path.match(/^\/api\/products\/([^/]+)\/([^/]+)$/)
    if (productUpdateMatch && method === "PUT") {
        const shopId = decodeURIComponent(productUpdateMatch[1])
        const productId = decodeURIComponent(productUpdateMatch[2])
        const body = await parseBody(req)
        const [error] = await updateProduct(shopId, productId, body as Record<string, unknown>)
        if (error) return err(res, error.message), true
        json(res, { success: true })
        return true
    }

    const productDeleteMatch = path.match(/^\/api\/products\/([^/]+)\/([^/]+)$/)
    if (productDeleteMatch && method === "DELETE") {
        const shopId = decodeURIComponent(productDeleteMatch[1])
        const productId = decodeURIComponent(productDeleteMatch[2])
        const [error] = await removeProduct(shopId, productId)
        if (error) return err(res, error.message), true
        json(res, { success: true })
        return true
    }

    // ========== ACCOUNTS ==========
    if (path === "/api/accounts" && method === "GET") {
        try {
            const fs = await import("node:fs")
            const accountsRaw = fs.readFileSync("data/accounts.json", "utf-8")
            const accountsData = JSON.parse(accountsRaw)
            json(res, accountsData)
        } catch {
            json(res, {})
        }
        return true
    }

    // ========== SETTINGS ==========
    if (path === "/api/settings" && method === "GET") {
        const settings = getSettings()
        const result: unknown[] = []
        settings.forEach(s => result.push(s))
        json(res, result)
        return true
    }

    const settingUpdateMatch = path.match(/^\/api\/settings\/(.+)$/)
    if (settingUpdateMatch && method === "PUT") {
        const settingId = decodeURIComponent(settingUpdateMatch[1])
        const body = await parseBody(req)
        const [error] = await setSetting(settingId, body["value"])
        if (error) return err(res, error.message), true
        json(res, { success: true })
        return true
    }

    // ========== PAYMENTS ==========
    if (path === "/api/payments" && method === "GET") {
        const payments = getAllPendingPayments()
        const result: unknown[] = []
        payments.forEach(p => result.push(p))
        json(res, result)
        return true
    }

    // ========== DISCOUNT CODES ==========
    const discountAddMatch = path.match(/^\/api\/shops\/([^/]+)\/discounts$/)
    if (discountAddMatch && method === "POST") {
        const shopId = decodeURIComponent(discountAddMatch[1])
        const body = await parseBody(req)
        const code = body["code"] as string
        const amount = body["amount"] as number
        if (!code || amount === undefined) return err(res, "code and amount required"), true
        const [error] = await createDiscountCode(shopId, code, amount)
        if (error) return err(res, error.message), true
        json(res, { success: true }, 201)
        return true
    }

    const discountDeleteMatch = path.match(/^\/api\/shops\/([^/]+)\/discounts\/(.+)$/)
    if (discountDeleteMatch && method === "DELETE") {
        const shopId = decodeURIComponent(discountDeleteMatch[1])
        const code = decodeURIComponent(discountDeleteMatch[2])
        const [error] = await removeDiscountCode(shopId, code)
        if (error) return err(res, error.message), true
        json(res, { success: true })
        return true
    }

    // ========== STOCK DATABASE ==========
    const stockGetMatch = path.match(/^\/api\/stock\/([^/]+)$/)
    if (stockGetMatch && method === "GET") {
        const productId = decodeURIComponent(stockGetMatch[1])
        try {
            const fsModule = await import("node:fs")
            const stockRaw = fsModule.readFileSync("data/stock-database.json", "utf-8")
            const stockData = JSON.parse(stockRaw)
            json(res, stockData[productId] || { items: [], snk: "", profpin: false })
        } catch {
            json(res, { items: [], snk: "", profpin: false })
        }
        return true
    }

    if (path === "/api/stock" && method === "GET") {
        try {
            const fsModule = await import("node:fs")
            const stockRaw = fsModule.readFileSync("data/stock-database.json", "utf-8")
            json(res, JSON.parse(stockRaw))
        } catch {
            json(res, {})
        }
        return true
    }

    const stockAddMatch = path.match(/^\/api\/stock\/([^/]+)$/)
    if (stockAddMatch && method === "POST") {
        const productId = decodeURIComponent(stockAddMatch[1])
        const body = await parseBody(req)
        const item = body["item"] as string
        if (!item) return err(res, "item required"), true
        try {
            const fsModule = await import("node:fs")
            const stockRaw = fsModule.readFileSync("data/stock-database.json", "utf-8")
            const stockData = JSON.parse(stockRaw)
            if (!stockData[productId]) stockData[productId] = { items: [], snk: "", profpin: false }
            stockData[productId].items.push(item)
            fsModule.writeFileSync("data/stock-database.json", JSON.stringify(stockData, null, 4))

            // Also update product amount in shops
            const shops = getShops()
            for (const [shopId, shop] of shops) {
                if (shop.products.has(productId)) {
                    await updateProduct(shopId, productId, { amount: stockData[productId].items.length })
                    break
                }
            }

            json(res, { success: true, count: stockData[productId].items.length }, 201)
        } catch (e) {
            err(res, `Failed to add stock: ${e}`, 500)
        }
        return true
    }

    const stockDeleteItemMatch = path.match(/^\/api\/stock\/([^/]+)\/(\d+)$/)
    if (stockDeleteItemMatch && method === "DELETE") {
        const productId = decodeURIComponent(stockDeleteItemMatch[1])
        const index = parseInt(stockDeleteItemMatch[2])
        try {
            const fsModule = await import("node:fs")
            const stockRaw = fsModule.readFileSync("data/stock-database.json", "utf-8")
            const stockData = JSON.parse(stockRaw)
            if (!stockData[productId]) return err(res, "Product not found in stock"), true
            if (index < 0 || index >= stockData[productId].items.length) return err(res, "Invalid index"), true
            stockData[productId].items.splice(index, 1)
            fsModule.writeFileSync("data/stock-database.json", JSON.stringify(stockData, null, 4))

            const shops = getShops()
            for (const [shopId, shop] of shops) {
                if (shop.products.has(productId)) {
                    await updateProduct(shopId, productId, { amount: stockData[productId].items.length })
                    break
                }
            }

            json(res, { success: true, count: stockData[productId].items.length })
        } catch (e) {
            err(res, `Failed to delete stock: ${e}`, 500)
        }
        return true
    }

    const stockSnkMatch = path.match(/^\/api\/stock\/([^/]+)\/snk$/)
    if (stockSnkMatch && method === "PUT") {
        const productId = decodeURIComponent(stockSnkMatch[1])
        const body = await parseBody(req)
        try {
            const fsModule = await import("node:fs")
            const stockRaw = fsModule.readFileSync("data/stock-database.json", "utf-8")
            const stockData = JSON.parse(stockRaw)
            if (!stockData[productId]) stockData[productId] = { items: [], snk: "", profpin: false }
            stockData[productId].snk = (body["snk"] as string) || ""
            if (body["profpin"] !== undefined) stockData[productId].profpin = body["profpin"]
            if (body["kode"] !== undefined) stockData[productId].kode = (body["kode"] as string) || ""
            fsModule.writeFileSync("data/stock-database.json", JSON.stringify(stockData, null, 4))
            json(res, { success: true })
        } catch (e) {
            err(res, `Failed to update SNK: ${e}`, 500)
        }
        return true
    }

    // ========== DASHBOARD CONFIG ==========
    if (path === "/api/dashboard-config" && method === "GET") {
        try {
            const fsModule = await import("node:fs")
            const raw = fsModule.readFileSync("data/dashboard-config.json", "utf-8")
            json(res, JSON.parse(raw))
        } catch {
            json(res, { dashboardName: "ShopBot", logoType: "emoji", logoValue: "🛒" })
        }
        return true
    }

    if (path === "/api/dashboard-config" && method === "PUT") {
        const body = await parseBody(req)
        try {
            const fsModule = await import("node:fs")
            fsModule.writeFileSync("data/dashboard-config.json", JSON.stringify(body, null, 4))
            json(res, { success: true })
        } catch (e) {
            err(res, `Failed to save config: ${e}`, 500)
        }
        return true
    }

    // ========== ACCOUNT DELETE ==========
    const accountDeleteMatch = path.match(/^\/api\/accounts\/(.+)$/)
    if (accountDeleteMatch && method === "DELETE") {
        const userId = decodeURIComponent(accountDeleteMatch[1])
        try {
            const fsModule = await import("node:fs")
            const raw = fsModule.readFileSync("data/accounts.json", "utf-8")
            const data = JSON.parse(raw)
            if (!data[userId]) return err(res, "Account not found"), true
            delete data[userId]
            fsModule.writeFileSync("data/accounts.json", JSON.stringify(data, null, 4))
            json(res, { success: true })
        } catch (e) {
            err(res, `Failed to delete account: ${e}`, 500)
        }
        return true
    }

    // ========== PANELS ==========
    if (path === "/api/panels" && method === "GET") {
        try {
            const fsModule = await import("node:fs")
            if (!fsModule.existsSync("data/panels.json")) return json(res, []), true
            json(res, JSON.parse(fsModule.readFileSync("data/panels.json", "utf-8")))
        } catch { json(res, []) }
        return true
    }

    const panelDeleteMatch = path.match(/^\/api\/panels\/(.+)$/)
    if (panelDeleteMatch && method === "DELETE") {
        const panelId = decodeURIComponent(panelDeleteMatch[1])
        try {
            const fsModule = await import("node:fs")
            const data: { id: string }[] = JSON.parse(fsModule.readFileSync("data/panels.json", "utf-8"))
            const filtered = data.filter(p => p.id !== panelId)
            if (filtered.length === data.length) return err(res, "Panel not found"), true
            fsModule.writeFileSync("data/panels.json", JSON.stringify(filtered, null, 4))
            json(res, { success: true })
        } catch (e) { err(res, `Failed to delete panel: ${e}`, 500) }
        return true
    }

    // ========== WARRANTIES ==========
    if (path === "/api/warranties/pending" && method === "GET") {
        try {
            const fsModule = await import("node:fs")
            if (!fsModule.existsSync("data/pending-warranties.json")) return json(res, {}), true
            json(res, JSON.parse(fsModule.readFileSync("data/pending-warranties.json", "utf-8")))
        } catch { json(res, {}) }
        return true
    }

    const pendingWarrantyDeleteMatch = path.match(/^\/api\/warranties\/pending\/(.+)$/)
    if (pendingWarrantyDeleteMatch && method === "DELETE") {
        const orderId = decodeURIComponent(pendingWarrantyDeleteMatch[1])
        try {
            const fsModule = await import("node:fs")
            const data = JSON.parse(fsModule.readFileSync("data/pending-warranties.json", "utf-8"))
            if (!data[orderId]) return err(res, "Not found"), true
            delete data[orderId]
            fsModule.writeFileSync("data/pending-warranties.json", JSON.stringify(data, null, 4))
            json(res, { success: true })
        } catch (e) { err(res, `Failed: ${e}`, 500) }
        return true
    }

    if (path === "/api/warranties/submissions" && method === "GET") {
        try {
            const fsModule = await import("node:fs")
            if (!fsModule.existsSync("data/warranty-submissions.json")) return json(res, {}), true
            json(res, JSON.parse(fsModule.readFileSync("data/warranty-submissions.json", "utf-8")))
        } catch { json(res, {}) }
        return true
    }

    const submissionDeleteMatch = path.match(/^\/api\/warranties\/submissions\/(.+)$/)
    if (submissionDeleteMatch && method === "DELETE") {
        const orderId = decodeURIComponent(submissionDeleteMatch[1])
        try {
            const fsModule = await import("node:fs")
            const data = JSON.parse(fsModule.readFileSync("data/warranty-submissions.json", "utf-8"))
            if (!data[orderId]) return err(res, "Not found"), true
            delete data[orderId]
            fsModule.writeFileSync("data/warranty-submissions.json", JSON.stringify(data, null, 4))
            json(res, { success: true })
        } catch (e) { err(res, `Failed: ${e}`, 500) }
        return true
    }

    // ========== PRODUCT FORMS ==========
    if (path === "/api/forms" && method === "GET") {
        try {
            const fsModule = await import("node:fs")
            if (!fsModule.existsSync("data/product-forms.json")) return json(res, {}), true
            json(res, JSON.parse(fsModule.readFileSync("data/product-forms.json", "utf-8")))
        } catch { json(res, {}) }
        return true
    }

    // ========== CLAIM TICKETS ==========
    if (path === "/api/claims" && method === "GET") {
        try {
            const fsModule = await import("node:fs")
            if (!fsModule.existsSync("data/claim-tickets.json")) return json(res, {}), true
            json(res, JSON.parse(fsModule.readFileSync("data/claim-tickets.json", "utf-8")))
        } catch { json(res, {}) }
        return true
    }

    const claimDeleteMatch = path.match(/^\/api\/claims\/(.+)$/)
    if (claimDeleteMatch && method === "DELETE") {
        const ticketId = decodeURIComponent(claimDeleteMatch[1])
        try {
            const fsModule = await import("node:fs")
            const data = JSON.parse(fsModule.readFileSync("data/claim-tickets.json", "utf-8"))
            if (!data[ticketId]) return err(res, "Not found"), true
            delete data[ticketId]
            fsModule.writeFileSync("data/claim-tickets.json", JSON.stringify(data, null, 4))
            json(res, { success: true })
        } catch (e) { err(res, `Failed: ${e}`, 500) }
        return true
    }

    // ========== PURCHASE HISTORY ==========
    if (path === "/api/purchase-history" && method === "GET") {
        try {
            const fsModule = await import("node:fs")
            if (!fsModule.existsSync("data/purchase-history.json")) return json(res, {}), true
            json(res, JSON.parse(fsModule.readFileSync("data/purchase-history.json", "utf-8")))
        } catch { json(res, {}) }
        return true
    }

    // ========== RENEWAL TRACKING ==========
    if (path === "/api/renewal/tracking" && method === "GET") {
        try {
            const { getRenewalTracking } = await import("@/features/renewal/renewal-database.js")
            json(res, getRenewalTracking())
        } catch { json(res, {}) }
        return true
    }

    // ========== RENEWAL CONFIGS ==========
    if (path === "/api/renewal/configs" && method === "GET") {
        try {
            const { getAllRenewalConfigs } = await import("@/features/renewal/renewal-database.js")
            json(res, getAllRenewalConfigs())
        } catch { json(res, {}) }
        return true
    }

    // POST /api/renewal/configs/:productId — toggle config
    const renewalConfigMatch = path.match(/^\/api\/renewal\/configs\/(.+)$/)
    if (renewalConfigMatch && method === "POST") {
        const productId = decodeURIComponent(renewalConfigMatch[1])
        try {
            const body = await parseBody(req)
            const enabled = Boolean(body["enabled"])
            const { getRenewalConfig, saveRenewalConfig } = await import("@/features/renewal/renewal-database.js")
            const existing = getRenewalConfig(productId) ?? {}
            saveRenewalConfig(productId, { ...existing, enabled })
            json(res, { success: true, productId, enabled })
        } catch (e) { err(res, `Failed: ${e}`, 500) }
        return true
    }

    // POST /api/renewal/action — approve or reject a renewal
    if (path === "/api/renewal/action" && method === "POST") {
        try {
            const body = await parseBody(req)
            const orderId = String(body["orderId"] ?? "")
            const action  = String(body["action"] ?? "")  // "approve" | "reject"

            if (!orderId || !["approve", "reject"].includes(action)) {
                return err(res, "Missing orderId or invalid action"), true
            }

            const { getRenewalRecord, updateRenewalRecord } = await import("@/features/renewal/renewal-database.js")
            const record = getRenewalRecord(orderId)
            if (!record) return err(res, "Record not found"), true
            if (record.status !== "admin-notified") return err(res, "Record not in admin-notified state"), true

            if (action === "approve") {
                updateRenewalRecord(orderId, { status: "admin-approved" })
                const { sendBuyerDurationOffer, disableAdminRenewalMessage } = await import("@/features/renewal/renewal-flow.js")
                const refreshedRecord = getRenewalRecord(orderId)
                if (refreshedRecord) {
                    disableAdminRenewalMessage(refreshedRecord).catch(() => {})
                    sendBuyerDurationOffer(refreshedRecord).catch(() => {})
                }
            } else {
                updateRenewalRecord(orderId, { status: "admin-rejected" })
                const { sendRejectionDMFromDashboard, disableAdminRenewalMessage } = await import("@/features/renewal/renewal-flow.js")
                const refreshedRecord = getRenewalRecord(orderId)
                if (refreshedRecord) {
                    disableAdminRenewalMessage(refreshedRecord).catch(() => {})
                    sendRejectionDMFromDashboard(refreshedRecord).catch(() => {})
                }
            }

            json(res, { success: true, orderId, action })
        } catch (e) { err(res, `Failed: ${e}`, 500) }
        return true
    }

    // POST /api/renewal/manual-trigger — admin manually triggers renewal for any order
    if (path === "/api/renewal/manual-trigger" && method === "POST") {
        try {
            const body    = await parseBody(req)
            const userId  = String(body["userId"]  ?? "").trim()
            const orderId = String(body["orderId"] ?? "").trim()
            const expiredStr = String(body["expiredStr"] ?? "").trim()  // DD/MM/YYYY or ""

            if (!userId || !orderId) {
                return err(res, "userId and orderId are required"), true
            }

            // Parse optional expiry override with strict round-trip validation
            let manualExpiryStr: string | null = null
            if (expiredStr) {
                const parts = expiredStr.split("/")
                if (parts.length === 3) {
                    const [ds, ms, ys] = parts
                    const d = parseInt(ds, 10), m = parseInt(ms, 10), y = parseInt(ys, 10)
                    if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
                        const dt = new Date(y, m - 1, d, 23, 59, 59)
                        // Round-trip check: reject JS-normalized invalid dates (e.g., 31/02)
                        if (!isNaN(dt.getTime()) &&
                            dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
                            manualExpiryStr = dt.toISOString()
                        }
                    }
                }
                if (!manualExpiryStr) return err(res, "Tanggal tidak valid. Gunakan DD/MM/YYYY (contoh: 31/02 tidak ada)."), true
            }

            const { getWarrantySubmission, getUserPurchaseHistory, saveWarrantySubmission } = await import("@/features/warranty/warranty-database.js")
            const { saveRenewalRecord, getRenewalRecord } = await import("@/features/renewal/renewal-database.js")
            const { sendBuyerDurationOffer } = await import("@/features/renewal/renewal-flow.js")

            // Guard: prevent overwriting an active renewal record
            const existing = getRenewalRecord(orderId)
            const terminal = ["completed", "buyer-declined", "admin-rejected", "no-response"]
            if (existing && !terminal.includes(existing.status)) {
                return err(res, `Renewal untuk order ini sudah aktif (status: ${existing.status}). Selesaikan proses sebelum memicu ulang.`), true
            }

            const submission = getWarrantySubmission(orderId)
            const history    = getUserPurchaseHistory(userId)
            const purchase   = history.find(h => h.orderId === orderId)

            const productId = submission?.productId ?? purchase?.productId
            const shopId    = purchase?.shopId

            if (!productId || !shopId) {
                return err(res, "Produk/toko tidak ditemukan untuk order ini. Pastikan purchase history ada."), true
            }

            if (manualExpiryStr && submission) {
                saveWarrantySubmission({ ...submission, warrantyExpiresAt: manualExpiryStr })
            }

            const warrantyExpiresAt = manualExpiryStr
                ?? submission?.warrantyExpiresAt
                ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

            const record = {
                orderId,
                userId,
                productId,
                productName:       submission?.productName ?? purchase?.productName ?? "Produk Tidak Diketahui",
                shopId,
                shopName:          submission?.shopName ?? purchase?.shopName ?? "Toko Tidak Diketahui",
                guildId:           submission?.guildId ?? "",
                warrantyExpiresAt,
                status:            "admin-approved" as const,
                isManual:          true,
                createdAt:         new Date().toISOString(),
            }

            saveRenewalRecord(record)
            sendBuyerDurationOffer(record).catch(() => {})

            json(res, { success: true, orderId, userId })
        } catch (e) { err(res, `Failed: ${e}`, 500) }
        return true
    }

    return false
}
