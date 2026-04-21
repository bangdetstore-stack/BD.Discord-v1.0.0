/* Developer: BANGDET.MD */
import { DateTime } from "luxon"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

// ─── ANSI Colors ────────────────────────────────────────────────────────────
const C = {
    reset:   "\x1b[0m",
    bold:    "\x1b[1m",
    dim:     "\x1b[2m",
    cyan:    "\x1b[36m",
    yellow:  "\x1b[33m",
    green:   "\x1b[32m",
    red:     "\x1b[31m",
    magenta: "\x1b[35m",
    blue:    "\x1b[34m",
    white:   "\x1b[97m",
    gray:    "\x1b[90m",
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function getWIBTime(): string {
    return DateTime.now().setZone("Asia/Jakarta").toFormat("HH:mm:ss") + " WIB"
}

function getWIBDateTime(): string {
    return DateTime.now().setZone("Asia/Jakarta").toFormat("dd/MM/yyyy HH:mm:ss") + " WIB"
}

function separator(width = 48): string {
    return C.gray + "─".repeat(width) + C.reset
}

function header(icon: string, title: string, color: string, width = 48): string {
    const label = ` ${icon} ${title} `
    const remaining = width - label.length - 2
    const line = "─".repeat(Math.max(0, remaining))
    return `${color}${C.bold}[ ${icon} ${title} ]${C.reset}${C.gray} ${line}${C.reset}`
}

function field(emoji: string, key: string, value: string, valueColor = C.white): string {
    const paddedKey = key.padEnd(9)
    return `  ${emoji} ${C.yellow}${paddedKey}${C.reset}: ${valueColor}${value}${C.reset}`
}

async function saveLog(section: string, lines: string[]): Promise<void> {
    try {
        const time = getWIBDateTime()
        const plain = lines.map(l => l.replace(/\x1b\[\d+m/g, "")).join("\n")
        const entry = `[${time}] [${section}]\n${plain}\n\n`
        await fs.appendFile(path.join(__dirname, "..", "..", "logs.txt"), entry)
    } catch {}
}

// ─── Log Types ──────────────────────────────────────────────────────────────

export interface CommandLogOptions {
    username:    string
    userId:      string
    channelName: string
    channelId:   string
    guildName:   string
    command:     string
}

export interface ButtonLogOptions {
    username:    string
    userId:      string
    channelId:   string
    guildName:   string
    buttonId:    string
    label?:      string
}

export interface MenuLogOptions {
    username:    string
    userId:      string
    channelId:   string
    guildName:   string
    menuId:      string
    selected:    string
}

export interface PaymentLogOptions {
    username:    string
    userId:      string
    productName: string
    shopName:    string
    amount:      number
    orderId:     string
    status:      "CREATED" | "COMPLETED" | "CANCELED" | "EXPIRED" | "FAILED"
}

export interface DeliveryLogOptions {
    username:    string
    userId:      string
    productName: string
    shopName:    string
    orderId:     string
}

// ─── ActivityLog ────────────────────────────────────────────────────────────

export class ActivityLog {

    /** Log slash command usage */
    static command(opts: CommandLogOptions): void {
        const lines = [
            header("⚡", "SLASH COMMAND", C.cyan),
            field("⏰", "Waktu",   getWIBTime()),
            field("🔰", "Tipe",    "Slash Command",                          C.cyan),
            field("👤", "User",    `${opts.username} (${opts.userId})`,      C.white),
            field("📍", "Channel", `#${opts.channelName} (${opts.channelId})`, C.blue),
            field("🏠", "Server",  opts.guildName,                           C.magenta),
            field("⚙️", "Command", `/${opts.command}`,                       C.green),
            separator(),
        ]
        lines.forEach(l => console.log(l))
        saveLog("COMMAND", lines)
    }

    /** Log button click */
    static button(opts: ButtonLogOptions): void {
        const displayLabel = opts.label ? `${opts.label} [${opts.buttonId}]` : opts.buttonId
        const lines = [
            header("🔘", "BUTTON CLICK", C.blue),
            field("⏰", "Waktu",  getWIBTime()),
            field("🔰", "Tipe",   "Button Interaction",                   C.blue),
            field("👤", "User",   `${opts.username} (${opts.userId})`,   C.white),
            field("📍", "Ch",     `#${opts.channelId}`,                  C.blue),
            field("🏠", "Server", opts.guildName,                         C.magenta),
            field("🎯", "Tombol", displayLabel,                           C.yellow),
            separator(),
        ]
        lines.forEach(l => console.log(l))
        saveLog("BUTTON", lines)
    }

    /** Log select menu interaction */
    static menu(opts: MenuLogOptions): void {
        const lines = [
            header("📋", "SELECT MENU", C.magenta),
            field("⏰", "Waktu",   getWIBTime()),
            field("🔰", "Tipe",    "Select Menu",                         C.magenta),
            field("👤", "User",    `${opts.username} (${opts.userId})`,  C.white),
            field("📍", "Ch",      `#${opts.channelId}`,                 C.blue),
            field("🏠", "Server",  opts.guildName,                        C.magenta),
            field("📌", "Menu",    opts.menuId,                           C.yellow),
            field("✅", "Pilihan", opts.selected,                         C.green),
            separator(),
        ]
        lines.forEach(l => console.log(l))
        saveLog("MENU", lines)
    }

    /** Log payment creation */
    static paymentCreated(opts: PaymentLogOptions): void {
        const statusColor = opts.status === "CREATED" ? C.yellow : C.green
        const lines = [
            header("💳", "PAYMENT", C.yellow),
            field("⏰", "Waktu",   getWIBTime()),
            field("👤", "User",    `${opts.username} (${opts.userId})`,  C.white),
            field("📦", "Produk",  opts.productName,                      C.cyan),
            field("🏪", "Toko",    opts.shopName,                         C.magenta),
            field("💰", "Total",   `Rp ${opts.amount.toLocaleString("id-ID")}`, C.green),
            field("🆔", "Order",   opts.orderId,                          C.gray),
            field("📊", "Status",  opts.status,                           statusColor),
            separator(),
        ]
        lines.forEach(l => console.log(l))
        saveLog("PAYMENT", lines)
    }

    /** Log payment status update (complete / cancel / expire) */
    static paymentStatus(opts: PaymentLogOptions): void {
        const colorMap: Record<string, string> = {
            COMPLETED: C.green,
            CANCELED:  C.red,
            EXPIRED:   C.gray,
            FAILED:    C.red,
            CREATED:   C.yellow,
        }
        const statusColor = colorMap[opts.status] ?? C.white
        const iconMap: Record<string, string> = {
            COMPLETED: "✅",
            CANCELED:  "❌",
            EXPIRED:   "⏰",
            FAILED:    "🔥",
            CREATED:   "💳",
        }
        const icon = iconMap[opts.status] ?? "📊"

        const lines = [
            header(icon, `PAYMENT ${opts.status}`, statusColor),
            field("⏰", "Waktu",  getWIBTime()),
            field("👤", "User",   `${opts.username} (${opts.userId})`,  C.white),
            field("📦", "Produk", opts.productName,                      C.cyan),
            field("🏪", "Toko",   opts.shopName,                         C.magenta),
            field("💰", "Total",  `Rp ${opts.amount.toLocaleString("id-ID")}`, C.green),
            field("🆔", "Order",  opts.orderId,                          C.gray),
            field("📊", "Status", opts.status,                           statusColor),
            separator(),
        ]
        lines.forEach(l => console.log(l))
        saveLog(`PAYMENT_${opts.status}`, lines)
    }

    /** Log item delivery after payment */
    static delivery(opts: DeliveryLogOptions): void {
        const lines = [
            header("📬", "ITEM DELIVERED", C.green),
            field("⏰", "Waktu",  getWIBTime()),
            field("👤", "User",   `${opts.username} (${opts.userId})`,  C.white),
            field("📦", "Produk", opts.productName,                      C.cyan),
            field("🏪", "Toko",   opts.shopName,                         C.magenta),
            field("🆔", "Order",  opts.orderId,                          C.gray),
            field("✅", "Status", "Item terkirim ke DM user",            C.green),
            separator(),
        ]
        lines.forEach(l => console.log(l))
        saveLog("DELIVERY", lines)
    }
}
