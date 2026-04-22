# 📝 Changelog

All notable changes to the **Discord Bot Store & Payment Integration** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-04-23

### Added
- **Project Documentation Separation:** Extracted the Changelog from the main `README.md` into a dedicated `CHANGELOG.md` file for better maintainability and readability.
- **Detailed Versioning Protocol:** Established a structured and comprehensive versioning protocol for future updates to ensure tracking of changes remains transparent.

### Changed
- **Version Bump:** Updated project version in `package.json` from `1.0.0` to `1.0.1`.

---

## [1.0.0] - (Initial Stable Release)

*Note: Core functionalities are also referred to as BangDet Store Bot v4.5.0 features in internal branches.*

### Added
- **Auto-Store & Panel System:** Interactive Discord UI (Select Menus and Buttons) to navigate the store panel seamlessly.
- **Stock Handler:** Automated stock management using `stock-database.json` to dispatch items immediately upon successful payment (taking the top shift).
- **Payment Gateway Integration:** Integrated Pakasir SDK for real-time QRIS generation and callback processing via an independent HTTP Server webhook listener.
- **Idempotency Guard:** Added safety checks via `delivered-orders.json` to prevent duplicate item delivery in case of multiple webhook triggers or spam.
- **Auto-Expired System:** Unpaid invoices automatically expire after 15 minutes, safely cancelling the order and freeing up resources.
- **Warranty & Claim Ticket System:** Discord modal forms for warranty claims with a configurable time limit (e.g., 24 hours), screenshot verification via DM, and private thread generation to safely handle user complaints between buyer and Admin.
- **Renewal System:** Automated background checker (runs every 30 minutes) for expiring warranties (H-4) with admin approval notifications and dynamic pricing/duration offers via DM.
- **Role Management & Loyalty:** Automatic role assignment for Buyers and specific product roles upon purchase. Implemented a VIP system for users exceeding transaction thresholds.
- **Economy & Inventories:** Individual user profiles feature purchase histories, acquired product inventories, and a virtual currency system.
- **Dashboard Web & API Server:** Integrated mini HTTP server serving static API endpoints, enabling connection to an admin dashboard.
- **Centralized Configuration:** All configurations (e.g., Log Channel ID, Admin Roles, Bot Language) are centralized in `settings.json` and are updatable on-the-fly.

### Changed
- **Refactoring:** Migrated synchronous I/O operations (`fs.readFileSync`) to asynchronous operations (`fs/promises`) across all core modules for significantly improved bot responsiveness.
- **Security & Stability:** Applied global `Mutex` locks on `Database.save()` functions to prevent race conditions and potential data corruption during simultaneous user transactions.
- **Clean-up:** Consolidated all API secrets and Discord tokens into a single `.env` file, removing legacy setup functions from `config.json`.

### Fixed
- Fixed an issue where the *Ticket Counter* for complaints did not auto-increment properly. It is now accurately tracked and saved to `data/ticket-counter.json`.
- Fixed *Pending Screenshots* timers for warranties disappearing after a bot restart by persistently saving their state to the database.
- Fixed an infinite loop bug with *Sticky Messages* that occurred if the bot's own text perfectly matched the sticky content.
