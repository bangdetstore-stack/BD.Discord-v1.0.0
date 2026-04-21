/* Developer: BANGDET.MD */
import { PrettyLog } from "@/lib/pretty-log.js"
import { Client, Collection, GatewayIntentBits, Interaction, SlashCommandBuilder } from "discord.js"
import fs from "fs/promises"
import path from "path"

import { EVENTS } from "@/middleware.js"
import { setPaymentClient, restorePaymentExpireTimers } from "@/features/payment/payment-flow.js"
import { loadPendingPayments } from "@/features/payment/database/payment-store.js"
import { startDashboardServer } from "@/dashboard/dashboard-server.js"
import { syncAllPanels } from "@/features/shops/panel-registry.js"
import { setWarrantyClient, restoreWarrantyTimers } from "@/features/warranty/warranty-flow.js"
import { setRenewalClient, restoreRenewalPaymentTimers } from "@/features/renewal/renewal-flow.js"
import { startRenewalChecker } from "@/features/renewal/renewal-checker.js"
import { setRoleClient } from "@/features/roles/role-handler.js"
import { restoreStickyMessages, loadStickyDatabase } from "@/features/sticky/sticky-handler.js"
import { fileURLToPath, pathToFileURL } from "node:url"
import { setActivity } from "./status.js"
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


interface Command {
    data: SlashCommandBuilder,
    execute: (client: Client, interaction: Interaction, ...args: unknown[]) => Promise<void>
}

declare module "discord.js" {
    export interface Client {
        commands: Collection<string, Command>
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers,      // untuk event GuildMemberAdd (join role)
        GatewayIntentBits.GuildMessages,     // untuk sticky message di guild
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,    // perlu untuk baca pesan guild
    ],
})


async function registerCommands(client: Client) {
    client.commands = new Collection()
    const commandsPath = path.join(__dirname, "..", "commands")
    const commandFiles = (await fs.readdir(commandsPath)).filter((file) => file.endsWith(".ts") || file.endsWith(".js"))

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file)
        const command: Command = await import(pathToFileURL(filePath).href)

        client.commands.set(command.data.name, command)
    }

    PrettyLog.logLoadStep("Commands registered")
}

async function registerEvents(client: Client<boolean>) {
    const eventsPath = path.join(__dirname, "..", "events")
    const eventFiles = (await fs.readdir(eventsPath)).filter((file) => file.endsWith(".ts") || file.endsWith(".js"))

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file)
        const event = await import(pathToFileURL(filePath).href)
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args))
        } else {
            client.on(event.name, (...args) => event.execute(...args))
        }
    }

    PrettyLog.logLoadStep("Events registered")
}

export async function startClient() {
    const token = process.env["DISCORD_TOKEN"]

    if (!token) {
        PrettyLog.error("Missing DISCORD_TOKEN environment variable")
        process.exit(1)
    }

    await registerCommands(client)
    await registerEvents(client)

    await client.login(token)

    // Muat pending payments dari file (jaga data jika bot restart)
    await loadPendingPayments()

    // Initialize payment + dashboard (single server for both)
    setPaymentClient(client)
    startDashboardServer()

    // Pulihkan expire timer untuk payment yang masih pending setelah restart
    restorePaymentExpireTimers()

    // Initialize warranty system
    const { loadWarrantyDatabase } = await import("@/features/warranty/warranty-database.js")
    await loadWarrantyDatabase()
    setWarrantyClient(client)
    restoreWarrantyTimers()

    // Initialize renewal system
    const { loadRenewalDatabase } = await import("@/features/renewal/renewal-database.js")
    await loadRenewalDatabase()
    setRenewalClient(client)
    restoreRenewalPaymentTimers()
    startRenewalChecker(client)

    // Initialize role system
    const { loadStockDatabase } = await import("@/features/shops/stock-handler.js")
    await loadStockDatabase()
    setRoleClient(client)

    // Restore sticky messages setelah bot online
    await loadStickyDatabase()
    restoreStickyMessages(client).catch(e => PrettyLog.warn(`[Sticky] Restore error: ${e}`))
}

client.once("clientReady", async () => {
    await syncAllPanels(client)
})

EVENTS.on("shopsUpdated", async () => {
    await syncAllPanels(client)
})

EVENTS.on('settingUpdated', async (settingId, _) => {
    if (settingId !== 'activityMessage' && settingId !== 'activityType') return
    setActivity(client)
})