// ========== API HELPER ==========
// Set DASHBOARD_SECRET in bot env and store the matching token here (localStorage key: dashboardToken)
function getDashboardToken() {
    try { return localStorage.getItem('dashboardToken') || ''; } catch { return ''; }
}
async function api(endpoint, options = {}) {
    const token = getDashboardToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Dashboard-Token'] = token;
    const res = await fetch(`/api${endpoint}`, {
        headers,
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (!window._dashboardAuthPrompted) {
            window._dashboardAuthPrompted = true;
            const t = prompt('Dashboard dilindungi. Masukkan token akses (DASHBOARD_SECRET):', '');
            if (t) {
                localStorage.setItem('dashboardToken', t);
                window._dashboardAuthPrompted = false;
                // Retry the original request once with new token
                const retryHeaders = { 'Content-Type': 'application/json', 'X-Dashboard-Token': t };
                const retry = await fetch(`/api${endpoint}`, {
                    headers: retryHeaders,
                    ...options,
                    body: options.body ? JSON.stringify(options.body) : undefined,
                });
                return retry.json();
            }
            window._dashboardAuthPrompted = false;
        }
        return data;
    }
    return res.json();
}

// ========== TOAST ==========
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ========== MODAL ==========
function openModal(title, bodyHtml, footerHtml = '', wide = false) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    const modal = document.getElementById('modal');
    modal.style.maxWidth = wide ? '700px' : '500px';
    document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
});

// ========== RUPIAH FORMATTER ==========
function formatRp(amount) {
    return 'Rp ' + Number(amount).toLocaleString('id-ID');
}

// ========== DATE FORMATTER ==========
function formatDate(iso) {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
}

function timeAgo(iso) {
    if (!iso) return '-';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h/24)}h ${h%24}j lalu`;
    if (h > 0) return `${h}j ${m}m lalu`;
    return `${m}m lalu`;
}

function sisaWaktu(purchasedAtIso, registrationHours) {
    if (!purchasedAtIso) return { label: '-', expired: false };
    const hours = (typeof registrationHours === 'number' && registrationHours > 0) ? registrationHours : 24;
    const expiryMs = new Date(purchasedAtIso).getTime() + hours * 60 * 60 * 1000;
    const remaining = expiryMs - Date.now();
    if (remaining <= 0) return { label: 'Kedaluwarsa', expired: true };
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    if (h > 0) return { label: `${h}j ${m}m`, expired: false };
    return { label: `${m}m`, expired: false };
}

// ========== NAVIGATION ==========
let currentPage = 'overview';
let cachedData = {};

// Collapsible group headers
document.querySelectorAll('.nav-group-header').forEach(header => {
    header.addEventListener('click', () => {
        const groupId = 'group-' + header.dataset.group;
        const children = document.getElementById(groupId);
        const collapsed = children.classList.toggle('collapsed');
        header.classList.toggle('collapsed', collapsed);
        // Persist collapse state
        const stored = JSON.parse(localStorage.getItem('navCollapsed') || '{}');
        stored[header.dataset.group] = collapsed;
        localStorage.setItem('navCollapsed', JSON.stringify(stored));
    });
});

// Restore collapse state from localStorage
(function restoreNavState() {
    const stored = JSON.parse(localStorage.getItem('navCollapsed') || '{}');
    document.querySelectorAll('.nav-group-header').forEach(header => {
        if (stored[header.dataset.group]) {
            document.getElementById('group-' + header.dataset.group)?.classList.add('collapsed');
            header.classList.add('collapsed');
        }
    });
})();

// Nav item clicks
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
});

function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');
    document.getElementById('page-title').textContent = pageNames[page] || page;
    document.getElementById('header-actions').innerHTML = '';
    renderPage(page);
}

const pageNames = {
    overview: 'Overview',
    shops: 'Shops',
    currencies: 'Currencies',
    products: 'Products',
    accounts: 'Accounts',
    settings: 'Settings',
    payments: 'Payments',
    panels: 'Panels',
    warranty: 'Garansi',
    renewal: 'Renewal',
};

function renderPage(page) {
    const content = document.getElementById('page-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const renderers = {
        overview: renderOverview,
        shops: renderShops,
        currencies: renderCurrencies,
        products: renderProducts,
        accounts: renderAccounts,
        settings: renderSettings,
        payments: renderPayments,
        panels: renderPanels,
        warranty: renderWarranty,
        renewal: renderRenewal,
    };
    (renderers[page] || renderOverview)();
}

// ========== LOAD DASHBOARD CONFIG (sidebar) ==========
async function loadDashboardConfig() {
    const config = await api('/dashboard-config');
    const logoEl = document.getElementById('sidebar-logo');
    const nameEl = document.getElementById('sidebar-name');
    if (config.dashboardName) nameEl.textContent = config.dashboardName;
    if (config.logoType === 'file') {
        logoEl.innerHTML = `<img src="${config.logoValue}" alt="Logo" style="width:32px;height:32px;border-radius:8px;">`;
    } else if (config.logoType === 'url') {
        logoEl.innerHTML = `<img src="${config.logoValue}" alt="Logo" style="width:32px;height:32px;border-radius:8px;">`;
    } else {
        logoEl.textContent = config.logoValue || '🛒';
    }
}

// ========== OVERVIEW ==========
async function renderOverview() {
    const stats = await api('/stats');
    const content = document.getElementById('page-content');

    content.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon">🏪</div><div class="stat-value">${stats.totalShops || 0}</div><div class="stat-label">Total Shops</div></div>
            <div class="stat-card"><div class="stat-icon">📦</div><div class="stat-value">${stats.totalProducts || 0}</div><div class="stat-label">Total Products</div></div>
            <div class="stat-card"><div class="stat-icon">💰</div><div class="stat-value">${stats.totalCurrencies || 0}</div><div class="stat-label">Currencies</div></div>
            <div class="stat-card"><div class="stat-icon">👥</div><div class="stat-value">${stats.totalAccounts || 0}</div><div class="stat-label">Accounts</div></div>
            <div class="stat-card"><div class="stat-icon">💳</div><div class="stat-value">${stats.pendingPayments || 0}</div><div class="stat-label">Pending Payments</div></div>
            <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value">${stats.totalPanels || 0}</div><div class="stat-label">Panels Aktif</div></div>
            <div class="stat-card"><div class="stat-icon">🛡️</div><div class="stat-value">${stats.activeWarranties || 0}</div><div class="stat-label">Garansi Aktif</div></div>
            <div class="stat-card"><div class="stat-icon">📝</div><div class="stat-value">${stats.warrantySubmissions || 0}</div><div class="stat-label">Submisi Garansi</div></div>
            <div class="stat-card"><div class="stat-icon">🎫</div><div class="stat-value">${stats.openClaimTickets || 0}</div><div class="stat-label">Tiket Terbuka</div></div>
        </div>
        <div class="data-table-wrapper">
            <div class="table-header"><h3>📋 Quick Actions</h3></div>
            <div style="padding: 20px; display: flex; flex-wrap: wrap; gap: 10px;">
                <button class="btn btn-primary" onclick="navigateTo('shops')">🏪 Kelola Shops</button>
                <button class="btn btn-ghost" onclick="navigateTo('products')">📦 Kelola Products & Stock</button>
                <button class="btn btn-ghost" onclick="navigateTo('panels')">📋 Lihat Panels</button>
                <button class="btn btn-ghost" onclick="navigateTo('warranty')">🛡️ Garansi</button>
                <button class="btn btn-ghost" onclick="navigateTo('settings')">⚙️ Settings</button>
            </div>
        </div>`;
}

// ========== SHOPS ==========
async function renderShops() {
    const shops = await api('/shops');
    cachedData.shops = shops;
    const content = document.getElementById('page-content');
    const headerActions = document.getElementById('header-actions');
    headerActions.innerHTML = `<button class="btn btn-primary" onclick="showCreateShopModal()">+ Tambah Shop</button>`;

    if (!shops.length) {
        content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏪</div><div class="empty-state-text">Belum ada shop.</div></div>`;
        return;
    }

    let html = '<div class="card-grid">';
    shops.forEach(shop => {
        const prodCount = shop.products?.length || 0;
        html += `<div class="card">
            <div class="card-title">${shop.emoji || ''} ${esc(shop.name)}</div>
            <div class="card-desc">${esc(shop.description) || '<i>No description</i>'}</div>
            <div class="card-meta">
                <span class="badge badge-blue">📦 ${prodCount} products</span>
            </div>
            <div class="card-actions">
                <button class="btn btn-sm btn-ghost" onclick="cachedData.selectedShopId='${shop.id}';navigateTo('products')">📦 Products</button>
                <button class="btn btn-sm btn-danger" onclick="deleteShop('${shop.id}','${esc(shop.name)}')">🗑️</button>
            </div>
        </div>`;
    });
    content.innerHTML = html + '</div>';
}

function showCreateShopModal() {
    openModal('Tambah Shop Baru', `
        <div class="form-group"><label>Nama Shop</label><input class="form-input" id="f-shop-name" placeholder="e.g. Netflix"></div>
        <div class="form-group"><label>Emoji</label><input class="form-input" id="f-shop-emoji" placeholder="🎬"></div>
        <div class="form-group"><label>Deskripsi</label><input class="form-input" id="f-shop-desc" placeholder="Produk Netflix Premium"></div>
    `, `<button class="btn btn-primary" onclick="createShop()">Buat</button><button class="btn btn-ghost" onclick="closeModal()">Batal</button>`);
}

async function createShop() {
    const name = document.getElementById('f-shop-name').value;
    const emoji = document.getElementById('f-shop-emoji').value;
    const description = document.getElementById('f-shop-desc').value;
    const currencies = await api('/currencies');
    if (!currencies.length) return showToast('Buat currency dulu', 'error');
    const currencyId = currencies[0].id;
    if (!name) return showToast('Nama wajib diisi', 'error');
    const res = await api('/shops', { method: 'POST', body: { name, emoji, description, currencyId } });
    if (res.error) return showToast(res.error, 'error');
    showToast('Shop berhasil dibuat!');
    closeModal();
    renderShops();
}

async function deleteShop(id, name) {
    if (!confirm(`Hapus shop "${name}"?`)) return;
    await api(`/shops/${id}`, { method: 'DELETE' });
    showToast('Shop dihapus!');
    renderShops();
}

// ========== CURRENCIES ==========
async function renderCurrencies() {
    const currencies = await api('/currencies');
    const content = document.getElementById('page-content');
    const headerActions = document.getElementById('header-actions');
    headerActions.innerHTML = `<button class="btn btn-primary" onclick="showCreateCurrencyModal()">+ Tambah Currency</button>`;

    if (!currencies.length) {
        content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-text">Belum ada currency.</div></div>`;
        return;
    }

    let html = '<div class="card-grid">';
    currencies.forEach(c => {
        html += `<div class="card">
            <div class="card-title">${c.emoji || '💵'} ${esc(c.name)}</div>
            <div class="card-actions">
                <button class="btn btn-sm btn-danger" onclick="deleteCurrency('${c.id}','${esc(c.name)}')">🗑️</button>
            </div>
        </div>`;
    });
    content.innerHTML = html + '</div>';
}

function showCreateCurrencyModal() {
    openModal('Tambah Currency', `
        <div class="form-group"><label>Nama Currency</label><input class="form-input" id="f-cur-name" placeholder="Rupiah"></div>
        <div class="form-group"><label>Emoji</label><input class="form-input" id="f-cur-emoji" placeholder="💵"></div>
    `, `<button class="btn btn-primary" onclick="createCurrency()">Buat</button><button class="btn btn-ghost" onclick="closeModal()">Batal</button>`);
}

async function createCurrency() {
    const name = document.getElementById('f-cur-name').value;
    const emoji = document.getElementById('f-cur-emoji').value;
    if (!name) return showToast('Nama wajib', 'error');
    await api('/currencies', { method: 'POST', body: { name, emoji } });
    showToast('Currency dibuat!');
    closeModal();
    renderCurrencies();
}

async function deleteCurrency(id, name) {
    if (!confirm(`Hapus "${name}"?`)) return;
    await api(`/currencies/${id}`, { method: 'DELETE' });
    showToast('Currency dihapus!');
    renderCurrencies();
}

// ========== PRODUCTS + STOCK ==========
async function renderProducts() {
    const [shops, stockAll, forms] = await Promise.all([
        api('/shops'),
        api('/stock'),
        api('/forms'),
    ]);
    cachedData.shops = shops;
    cachedData.stockAll = stockAll;
    cachedData.forms = forms;
    const content = document.getElementById('page-content');
    const headerActions = document.getElementById('header-actions');

    if (!shops.length) {
        content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">Buat shop dulu.</div></div>`;
        return;
    }

    const selectedShopId = cachedData.selectedShopId || shops[0].id;
    cachedData.selectedShopId = selectedShopId;

    let shopOpts = shops.map(s => `<option value="${s.id}" ${s.id === selectedShopId ? 'selected' : ''}>${s.emoji || ''} ${esc(s.name)}</option>`).join('');

    headerActions.innerHTML = `
        <select class="form-select" style="width:200px" onchange="cachedData.selectedShopId=this.value; renderProducts()">${shopOpts}</select>
        <button class="btn btn-primary" onclick="showAddProductModal()">+ Tambah Produk</button>`;

    const selectedShop = shops.find(s => s.id === selectedShopId);
    const products = selectedShop?.products || [];

    if (!products.length) {
        content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">Shop ini belum ada produk.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>${selectedShop.emoji || ''} ${esc(selectedShop.name)} — Products</h3></div>
        <table class="data-table"><thead><tr><th>Produk</th><th>Harga</th><th>Stock</th><th>Form Garansi</th><th>Aksi</th></tr></thead><tbody>`;

    products.forEach(p => {
        const stockInfo = stockAll[p.id];
        const stockCount = stockInfo ? stockInfo.items.length : 0;
        const stockBadge = stockCount > 0 ? `<span class="badge badge-green">${stockCount}</span>` : `<span class="badge badge-red">0</span>`;

        const formCfg = forms[p.id];
        const formBadge = formCfg?.enabled
            ? `<span class="badge badge-green">✅ Aktif</span>`
            : `<span class="badge" style="background:var(--bg-input);color:var(--text-muted)">❌ Nonaktif</span>`;

        html += `<tr>
            <td><strong>${esc(p.name)}</strong><br><span style="color:var(--text-muted);font-size:0.78rem">${esc(p.description || '').substring(0,80)}</span></td>
            <td><strong style="color:var(--accent-green)">${formatRp(p.price)}</strong></td>
            <td>${stockBadge}</td>
            <td>${formBadge}</td>
            <td style="white-space:nowrap">
                <button class="btn btn-sm btn-primary" onclick="showStockModal('${selectedShopId}','${p.id}','${esc(p.name)}')">📋 Stok</button>
                <button class="btn btn-sm btn-ghost" onclick="showEditProductModal('${selectedShopId}','${p.id}')">✏️</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${selectedShopId}','${p.id}','${esc(p.name)}')">🗑️</button>
            </td>
        </tr>`;
    });

    content.innerHTML = html + '</tbody></table></div>';
}

function showAddProductModal() {
    openModal('Tambah Produk', `
        <div class="form-group"><label>Nama</label><input class="form-input" id="f-prod-name" placeholder="Netflix Premium 1P1U"></div>
        <div class="form-group"><label>Deskripsi</label><input class="form-input" id="f-prod-desc" placeholder="1 Profile 1 User"></div>
        <div class="form-group"><label>Harga (Rp)</label><input class="form-input" id="f-prod-price" type="number" placeholder="28000"></div>
    `, `<button class="btn btn-primary" onclick="addProduct()">Tambah</button><button class="btn btn-ghost" onclick="closeModal()">Batal</button>`);
}

async function addProduct() {
    const name = document.getElementById('f-prod-name').value;
    const description = document.getElementById('f-prod-desc').value;
    const price = parseFloat(document.getElementById('f-prod-price').value);
    if (!name || isNaN(price)) return showToast('Nama dan harga wajib', 'error');
    await api(`/products/${cachedData.selectedShopId}`, { method: 'POST', body: { name, description, price, amount: 0 } });
    showToast('Produk ditambahkan!');
    closeModal();
    renderProducts();
}

function showEditProductModal(shopId, productId) {
    const shop = cachedData.shops?.find(s => s.id === shopId);
    const product = shop?.products?.find(p => p.id === productId);
    if (!product) return;
    openModal(`Edit: ${product.name}`, `
        <div class="form-group"><label>Nama</label><input class="form-input" id="f-edit-name" value="${esc(product.name)}"></div>
        <div class="form-group"><label>Deskripsi</label><input class="form-input" id="f-edit-desc" value="${esc(product.description || '')}"></div>
        <div class="form-group"><label>Harga (Rp)</label><input class="form-input" id="f-edit-price" type="number" value="${product.price}"></div>
    `, `<button class="btn btn-primary" onclick="updateProduct('${shopId}','${productId}')">Simpan</button><button class="btn btn-ghost" onclick="closeModal()">Batal</button>`);
}

async function updateProduct(shopId, productId) {
    const name = document.getElementById('f-edit-name').value;
    const description = document.getElementById('f-edit-desc').value;
    const price = parseFloat(document.getElementById('f-edit-price').value);
    await api(`/products/${shopId}/${productId}`, { method: 'PUT', body: { name, description, price } });
    showToast('Produk diupdate!');
    closeModal();
    renderProducts();
}

async function deleteProduct(shopId, productId, name) {
    if (!confirm(`Hapus "${name}"?`)) return;
    await api(`/products/${shopId}/${productId}`, { method: 'DELETE' });
    showToast('Produk dihapus!');
    renderProducts();
}

// ========== STOCK MODAL ==========
async function showStockModal(shopId, productId, productName) {
    const stock = await api(`/stock/${productId}`);
    cachedData.currentStockProductId = productId;
    cachedData.currentStockShopId = shopId;

    let itemsHtml = '';
    if (stock.items && stock.items.length) {
        itemsHtml = stock.items.map((item, i) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:6px;font-size:0.82rem;">
                <code style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item)}</code>
                <button class="btn btn-sm btn-danger" onclick="deleteStockItem('${productId}',${i})" style="margin-left:8px;flex-shrink:0">🗑️</button>
            </div>`).join('');
    } else {
        itemsHtml = '<div style="text-align:center;color:var(--text-muted);padding:16px">Stok kosong</div>';
    }

    const profpinChecked = stock.profpin ? 'checked' : '';
    const kodeVal = esc(stock.kode || '');
    const snkVal = esc(stock.snk || '');

    openModal(`📋 Stok: ${productName}`, `
        <div style="margin-bottom:16px">
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px">📦 Total Stok: <strong>${stock.items?.length || 0}</strong></div>
            <div style="max-height:200px;overflow-y:auto">${itemsHtml}</div>
        </div>
        <div class="form-group">
            <label>Tambah Stok Baru (1 per baris)</label>
            <textarea class="form-input" id="f-stock-items" rows="3" placeholder="email@mail.com, password123&#10;email2@mail.com, pass456" style="resize:vertical"></textarea>
        </div>
        <div style="border-top:1px solid var(--border-color);padding-top:12px;margin-top:12px">
            <div class="form-group">
                <label>🔑 Kode Akses / Kode Produk</label>
                <input class="form-input" id="f-stock-kode" value="${kodeVal}" placeholder="Kode khusus produk (opsional)">
            </div>
            <div class="form-group">
                <label>⚠️ S&K (Syarat & Ketentuan)</label>
                <textarea class="form-input" id="f-stock-snk" rows="4" style="resize:vertical">${snkVal}</textarea>
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:10px">
                <input type="checkbox" id="f-stock-profpin" ${profpinChecked} style="width:18px;height:18px;cursor:pointer">
                <label for="f-stock-profpin" style="margin:0;cursor:pointer">🔒 Wajib Profile PIN saat pembelian</label>
            </div>
        </div>
    `, `<button class="btn btn-primary" onclick="saveStockAll('${productId}')">💾 Simpan</button><button class="btn btn-ghost" onclick="closeModal()">Tutup</button>`, true);
}

async function saveStockAll(productId) {
    const rawItems = document.getElementById('f-stock-items').value.trim();
    if (rawItems) {
        const lines = rawItems.split('\n').map(l => l.trim()).filter(Boolean);
        for (const item of lines) {
            await api(`/stock/${productId}`, { method: 'POST', body: { item } });
        }
    }
    const snk = document.getElementById('f-stock-snk').value;
    const kode = document.getElementById('f-stock-kode').value;
    const profpin = document.getElementById('f-stock-profpin').checked;
    await api(`/stock/${productId}/snk`, { method: 'PUT', body: { snk, kode, profpin } });
    showToast('Stok & konfigurasi berhasil disimpan!');
    closeModal();
    renderProducts();
}

async function deleteStockItem(productId, index) {
    await api(`/stock/${productId}/${index}`, { method: 'DELETE' });
    showToast('Item dihapus');
    const shop = cachedData.shops?.find(s => s.id === cachedData.currentStockShopId);
    const prod = shop?.products?.find(p => p.id === productId);
    showStockModal(cachedData.currentStockShopId, productId, prod?.name || 'Product');
}

// ========== ACCOUNTS ==========
async function renderAccounts() {
    const [accounts, currencies, purchaseHistory, submissions] = await Promise.all([
        api('/accounts'),
        api('/currencies'),
        api('/purchase-history'),
        api('/warranties/submissions'),
    ]);
    cachedData.currencies = currencies;
    cachedData.purchaseHistory = purchaseHistory;
    cachedData.submissions = submissions;

    const content = document.getElementById('page-content');
    const headerActions = document.getElementById('header-actions');
    headerActions.innerHTML = `<input class="form-input" id="account-filter" placeholder="🔍 Cari User ID..." style="width:250px" oninput="filterAccounts()">`;

    const entries = Object.entries(accounts);
    if (!entries.length) {
        content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">Belum ada akun.</div></div>`;
        return;
    }

    cachedData.accounts = accounts;
    renderAccountTable(entries, currencies, purchaseHistory, submissions);
}

function renderAccountTable(entries, currencies, purchaseHistory, submissions) {
    const content = document.getElementById('page-content');

    // Build a userId → submissions[] map
    const submByUser = {};
    Object.values(submissions || {}).forEach(s => {
        if (!submByUser[s.userId]) submByUser[s.userId] = [];
        submByUser[s.userId].push(s);
    });

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>👥 User Accounts (${entries.length})</h3></div>
        <table class="data-table">
        <thead><tr>
            <th>User ID</th>
            <th>Saldo</th>
            <th>Inventaris</th>
            <th>Pembelian</th>
            <th>Garansi</th>
            <th>Aksi</th>
        </tr></thead><tbody>`;

    entries.forEach(([userId, acc]) => {
        // --- Currencies ---
        const currs = Object.entries(acc.currencies || {});
        const currStr = currs.length
            ? currs.map(([id, c]) => {
                const ci = currencies.find(cur => cur.id === id);
                return `<span class="badge badge-green">${ci?.emoji || ''} ${ci?.name || id}: <strong>${formatRp(c.amount)}</strong></span>`;
            }).join('<br>')
            : '<span style="color:var(--text-muted)">—</span>';

        // --- Inventory ---
        const invEntries = Object.entries(acc.inventory || {});
        // Use purchase history to resolve product names
        const userHistory = purchaseHistory[userId] || [];
        const productNameMap = {};
        userHistory.forEach(r => { productNameMap[r.productId] = r.productName; });

        const invStr = invEntries.length
            ? invEntries.map(([pid, b]) => {
                const name = productNameMap[pid] || pid.slice(0, 8) + '…';
                return `<span class="badge badge-blue">📦 ${name} ×${b.amount}</span>`;
            }).join('<br>')
            : '<span style="color:var(--text-muted)">—</span>';

        // --- Purchase count ---
        const buyCount = userHistory.length;

        // --- Warranty submissions ---
        const userSubmissions = submByUser[userId] || [];
        const warSubStr = userSubmissions.length
            ? userSubmissions.map(s => {
                let expiry;
                if (!s.warrantyExpiresAt) expiry = `<span class="badge badge-green">♾️ Tidak ada batas</span>`;
                else {
                    const ts = new Date(s.warrantyExpiresAt);
                    const expired = ts < new Date();
                    expiry = `<span class="badge ${expired ? 'badge-red' : 'badge-green'}">${expired ? '❌' : '🛡️'} ${formatDate(s.warrantyExpiresAt)}</span>`;
                }
                return `<span style="font-size:0.8rem;color:var(--text-muted)">${s.productName?.slice(0,20) || s.orderId}</span><br>${expiry}`;
            }).join('<hr style="border-color:var(--border-color);margin:4px 0">')
            : '<span style="color:var(--text-muted)">—</span>';

        html += `<tr data-userid="${userId}">
            <td>
                <code style="font-size:0.78rem">${userId}</code>
                <button class="btn btn-sm" style="margin-left:4px;padding:2px 6px;font-size:0.7rem" onclick="navigator.clipboard.writeText('${userId}');showToast('Copied!')">📋</button>
            </td>
            <td>${currStr}</td>
            <td>${invStr}</td>
            <td style="text-align:center">
                <span class="badge badge-blue">${buyCount} transaksi</span>
                ${buyCount > 0 ? `<br><button class="btn btn-sm" style="margin-top:4px;font-size:0.75rem" onclick="showUserHistory('${userId}')">📜 Riwayat</button>` : ''}
            </td>
            <td>${warSubStr}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteAccount('${userId}')">🗑️</button></td>
        </tr>`;
    });

    content.innerHTML = html + '</tbody></table></div>';
}

function filterAccounts() {
    const filter = document.getElementById('account-filter').value.toLowerCase();
    const rows = document.querySelectorAll('.data-table tbody tr');
    rows.forEach(row => {
        const uid = row.getAttribute('data-userid') || '';
        row.style.display = uid.toLowerCase().includes(filter) ? '' : 'none';
    });
}

function showUserHistory(userId) {
    const history = (cachedData.purchaseHistory || {})[userId] || [];
    if (!history.length) { showToast('Tidak ada riwayat', 'info'); return; }
    let rows = history.map(r => `<tr>
        <td><code style="font-size:0.8rem">${r.orderId}</code></td>
        <td>${r.productName || '—'}</td>
        <td>${r.shopName || '—'}</td>
        <td>${formatDate(r.purchasedAt)}</td>
    </tr>`).join('');
    openModal(`📜 Riwayat Pembelian — ${userId}`,
        `<table class="data-table"><thead><tr><th>Order ID</th><th>Produk</th><th>Toko</th><th>Tanggal</th></tr></thead><tbody>${rows}</tbody></table>`,
        '', true);
}

async function deleteAccount(userId) {
    if (!confirm(`Hapus akun ${userId}?`)) return;
    await api(`/accounts/${userId}`, { method: 'DELETE' });
    showToast('Akun dihapus!');
    renderAccounts();
}

// ========== SETTINGS (2 TABS) ==========
let settingsTab = 'dashboard';

async function renderSettings() {
    const content = document.getElementById('page-content');

    content.innerHTML = `
        <div class="settings-tabs" style="display:flex;gap:4px;margin-bottom:24px;background:var(--bg-card);padding:4px;border-radius:var(--radius-md);border:1px solid var(--border-color);width:fit-content">
            <button class="settings-tab ${settingsTab==='dashboard'?'active':''}" onclick="settingsTab='dashboard';renderSettings()">🎨 Pengaturan Dashboard</button>
            <button class="settings-tab ${settingsTab==='bot'?'active':''}" onclick="settingsTab='bot';renderSettings()">🤖 Profile Bot</button>
        </div>
        <div id="settings-content"><div class="loading"><div class="spinner"></div></div></div>`;

    if (settingsTab === 'dashboard') {
        await renderDashboardSettings();
    } else {
        await renderBotSettings();
    }
}

async function renderDashboardSettings() {
    const config = await api('/dashboard-config');
    const sc = document.getElementById('settings-content');

    sc.innerHTML = `<div class="data-table-wrapper">
        <div class="table-header"><h3>🎨 Pengaturan Dashboard</h3></div>
        <div style="padding:24px">
            <div class="form-group">
                <label>Nama Dashboard</label>
                <input class="form-input" id="f-dash-name" value="${esc(config.dashboardName || 'ShopBot')}" placeholder="BangDet Store">
            </div>
            <div class="form-group">
                <label>Sumber Logo</label>
                <select class="form-select" id="f-logo-type" onchange="toggleLogoInput()">
                    <option value="file" ${config.logoType==='file'?'selected':''}>Dari File (PrimaryLogoNoBg.png)</option>
                    <option value="url" ${config.logoType==='url'?'selected':''}>Dari URL Gambar</option>
                    <option value="emoji" ${config.logoType==='emoji'?'selected':''}>Emoji</option>
                </select>
            </div>
            <div class="form-group" id="logo-value-group">
                <label id="logo-value-label">Logo Value</label>
                <input class="form-input" id="f-logo-value" value="${esc(config.logoValue || '/logo.png')}" placeholder="/logo.png">
            </div>
            <div style="margin-top:8px">
                <div style="display:flex;align-items:center;gap:12px">
                    <span style="color:var(--text-secondary)">Preview:</span>
                    <div id="logo-preview" style="width:48px;height:48px;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--bg-input);font-size:2rem">
                        ${config.logoType === 'emoji' ? config.logoValue : `<img src="${esc(config.logoValue)}" style="width:100%;height:100%;object-fit:cover">`}
                    </div>
                </div>
            </div>
            <button class="btn btn-primary" style="margin-top:20px" onclick="saveDashboardConfig()">💾 Simpan</button>
        </div>
    </div>`;
}

function toggleLogoInput() {
    const type = document.getElementById('f-logo-type').value;
    const label = document.getElementById('logo-value-label');
    const input = document.getElementById('f-logo-value');
    if (type === 'file') { label.textContent = 'Path File'; input.placeholder = '/logo.png'; }
    else if (type === 'url') { label.textContent = 'URL Gambar'; input.placeholder = 'https://...'; }
    else { label.textContent = 'Emoji'; input.placeholder = '🛒'; }
}

async function saveDashboardConfig() {
    const dashboardName = document.getElementById('f-dash-name').value;
    const logoType = document.getElementById('f-logo-type').value;
    const logoValue = document.getElementById('f-logo-value').value;
    await api('/dashboard-config', { method: 'PUT', body: { dashboardName, logoType, logoValue } });
    showToast('Dashboard config disimpan!');
    loadDashboardConfig();
}

// ---- Friendly labels for known setting IDs ----
const SETTING_LABELS = {
    logChannelId:        { label: '📊 Log Transaksi — Channel ID',       hint: 'ID channel Discord untuk log transaksi pembayaran' },
    warrantyLogChannelId:{ label: '🛡️ Log Garansi — Channel ID',         hint: 'ID channel Discord untuk log submisi garansi' },
    claimChannelId:      { label: '🎫 Channel Tiket Komplain — Channel ID', hint: 'ID channel tempat bot membuat private thread tiket komplain' },
    claimAdminRoles:     { label: '👮 Role Admin Komplain (pisah koma)',  hint: 'Role ID yang akan di-tag saat tiket baru dibuat (maks 5, pisah dengan koma)' },
};

async function renderBotSettings() {
    const settings = await api('/settings');
    const sc = document.getElementById('settings-content');

    if (!settings.length) {
        sc.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚙️</div><div class="empty-state-text">Tidak ada settings.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper"><div class="table-header"><h3>🤖 Profile Bot</h3></div>`;
    settings.forEach(s => {
        const val = s.value !== undefined && s.value !== null ? s.value : '';
        const friendly = SETTING_LABELS[s.id];
        const displayLabel = friendly ? friendly.label : esc(s.name || s.id);
        const hint = friendly ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${friendly.hint}</div>` : '';
        html += `<div class="setting-item">
            <div class="setting-info">
                <div class="setting-name">${displayLabel}</div>
                <div class="setting-type">${s.type} — ID: ${s.id}</div>
                ${hint}
            </div>
            <div class="setting-value">
                <input class="form-input" value="${esc(String(val))}" id="setting-${s.id}" style="width:250px">
                <button class="btn btn-sm btn-primary" onclick="saveSetting('${s.id}')">💾</button>
            </div>
        </div>`;
    });
    sc.innerHTML = html + '</div>';
}

async function saveSetting(id) {
    let value = document.getElementById(`setting-${id}`).value;
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!isNaN(value) && value !== '') value = Number(value);
    await api(`/settings/${id}`, { method: 'PUT', body: { value } });
    showToast('Setting disimpan!');
}

// ========== PAYMENTS ==========
async function renderPayments() {
    const payments = await api('/payments');
    const content = document.getElementById('page-content');

    if (!payments.length) {
        content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💳</div><div class="empty-state-text">Tidak ada transaksi pending.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>💳 Pending Payments (${payments.length})</h3></div>
        <table class="data-table"><thead><tr><th>Order ID</th><th>User</th><th>Product</th><th>Amount</th><th>Status</th></tr></thead><tbody>`;

    payments.forEach(p => {
        html += `<tr>
            <td><code>${p.orderId}</code></td>
            <td>${p.userId}</td>
            <td>${esc(p.productName || '-')}</td>
            <td><strong>${formatRp(p.totalPayment || 0)}</strong></td>
            <td><span class="badge badge-orange">${p.status}</span></td>
        </tr>`;
    });
    content.innerHTML = html + '</tbody></table></div>';
}

// ========== PANELS ==========
async function renderPanels() {
    const panels = await api('/panels');
    const content = document.getElementById('page-content');

    if (!panels.length) {
        content.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Belum ada panel. Gunakan <code>/panelshop</code> di Discord untuk membuat panel.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>📋 Shop Panels (${panels.length})</h3></div>
        <table class="data-table">
            <thead><tr><th>Panel ID</th><th>Judul</th><th>Channel</th><th>Warna</th><th>Setup</th><th>Aksi</th></tr></thead>
            <tbody>`;

    panels.forEach(p => {
        const shortId = p.id.substring(0, 8) + '…';
        const hexColor = '#' + (p.color || 0).toString(16).toUpperCase().padStart(6, '0');
        const setupStatus = p.setupMessageId
            ? `<span class="badge badge-green">✅ Linked</span>`
            : `<span class="badge" style="background:var(--bg-input);color:var(--text-muted)">⚠️ Unlinked</span>`;

        html += `<tr>
            <td><code title="${esc(p.id)}">${shortId}</code></td>
            <td><strong>${esc(p.title || '-')}</strong><br><span style="font-size:0.75rem;color:var(--text-muted)">${esc((p.description || '').substring(0, 50))}</span></td>
            <td><code>#${p.channelId || '-'}</code></td>
            <td>
                <div style="display:flex;align-items:center;gap:6px">
                    <div style="width:16px;height:16px;border-radius:4px;background:${hexColor};flex-shrink:0"></div>
                    <span style="font-size:0.8rem">${hexColor}</span>
                </div>
            </td>
            <td>${setupStatus}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deletePanel('${esc(p.id)}')">🗑️ Hapus</button>
            </td>
        </tr>`;
    });

    content.innerHTML = html + '</tbody></table></div>';
}

async function deletePanel(panelId) {
    if (!confirm('Hapus panel ini dari registry? Panel di Discord tidak akan terhapus secara otomatis.')) return;
    const res = await api(`/panels/${encodeURIComponent(panelId)}`, { method: 'DELETE' });
    if (res.error) return showToast(res.error, 'error');
    showToast('Panel dihapus dari registry!');
    renderPanels();
}

// ========== GARANSI ==========
let warrantyTab = 'active';

async function renderWarranty() {
    const content = document.getElementById('page-content');

    content.innerHTML = `
        <div class="settings-tabs" style="display:flex;gap:4px;margin-bottom:24px;background:var(--bg-card);padding:4px;border-radius:var(--radius-md);border:1px solid var(--border-color);width:fit-content">
            <button class="settings-tab ${warrantyTab==='active'?'active':''}" onclick="warrantyTab='active';renderWarranty()">🔔 Aktif</button>
            <button class="settings-tab ${warrantyTab==='history'?'active':''}" onclick="warrantyTab='history';renderWarranty()">📜 Riwayat</button>
            <button class="settings-tab ${warrantyTab==='tickets'?'active':''}" onclick="warrantyTab='tickets';renderWarranty()">🎫 Tiket</button>
        </div>
        <div id="warranty-content"><div class="loading"><div class="spinner"></div></div></div>`;

    if (warrantyTab === 'active') {
        await renderWarrantyActive();
    } else if (warrantyTab === 'history') {
        await renderWarrantyHistory();
    } else {
        await renderClaimTickets();
    }
}

async function renderWarrantyActive() {
    const pending = await api('/warranties/pending');
    const wc = document.getElementById('warranty-content');
    const entries = Object.entries(pending);

    if (!entries.length) {
        wc.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🛡️</div><div class="empty-state-text">Tidak ada garansi aktif saat ini.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>🔔 Garansi Aktif (${entries.length})</h3></div>
        <table class="data-table">
            <thead><tr><th>Order ID</th><th>User</th><th>Produk</th><th>Dibeli</th><th>Sisa Waktu</th><th>Reminder</th><th>Aksi</th></tr></thead>
            <tbody>`;

    entries.forEach(([orderId, w]) => {
        const shortOrder = orderId.substring(0, 12) + '…';
        const reminderBadge = w.reminderSent
            ? `<span class="badge badge-orange">📤 Terkirim</span>`
            : `<span class="badge" style="background:var(--bg-input);color:var(--text-muted)">⏳ Belum</span>`;

        const sisa = sisaWaktu(w.purchasedAt, w.registrationHours);
        const sisaBadge = sisa.expired
            ? `<span class="badge badge-red">⌛ Kedaluwarsa</span>`
            : `<span class="badge badge-green">⏰ ${sisa.label}</span>`;

        html += `<tr>
            <td><code title="${esc(orderId)}">${shortOrder}</code></td>
            <td><code>${esc(w.userId || '-')}</code></td>
            <td><strong>${esc(w.productName || '-')}</strong><br><span style="font-size:0.75rem;color:var(--text-muted)">${esc(w.shopName || '')}</span></td>
            <td>
                <span style="font-size:0.82rem">${formatDate(w.purchasedAt)}</span><br>
                <span style="font-size:0.75rem;color:var(--text-muted)">${timeAgo(w.purchasedAt)}</span>
            </td>
            <td>${sisaBadge}</td>
            <td>${reminderBadge}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deletePendingWarranty('${esc(orderId)}')">🗑️</button>
            </td>
        </tr>`;
    });

    wc.innerHTML = html + '</tbody></table></div>';
}

async function deletePendingWarranty(orderId) {
    if (!confirm('Hapus garansi aktif ini? Timer akan dihentikan.')) return;
    const res = await api(`/warranties/pending/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    if (res.error) return showToast(res.error, 'error');
    showToast('Garansi aktif dihapus!');
    renderWarranty();
}

async function renderWarrantyHistory() {
    const submissions = await api('/warranties/submissions');
    const wc = document.getElementById('warranty-content');
    const entries = Object.entries(submissions);

    if (!entries.length) {
        wc.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">Belum ada submisi garansi.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>📜 Riwayat Submisi (${entries.length})</h3></div>
        <table class="data-table">
            <thead><tr><th>Order ID</th><th>User</th><th>Produk</th><th>Jawaban Form</th><th>Screenshot</th><th>Waktu</th><th>Aksi</th></tr></thead>
            <tbody>`;

    entries.forEach(([orderId, s]) => {
        const shortOrder = orderId.substring(0, 12) + '…';

        const fieldLines = [s.field1, s.field2, s.field3]
            .filter(Boolean)
            .map((f, i) => `<div style="font-size:0.78rem"><b>F${i+1}:</b> ${esc(String(f).substring(0, 60))}</div>`)
            .join('') || '<span style="color:var(--text-muted)">-</span>';

        const ssBadge = s.screenshotUrl
            ? `<a href="${esc(s.screenshotUrl)}" target="_blank" class="btn btn-sm btn-ghost">🖼️ Lihat</a>`
            : `<span style="color:var(--text-muted);font-size:0.8rem">Tidak ada</span>`;

        html += `<tr>
            <td><code title="${esc(orderId)}">${shortOrder}</code></td>
            <td><code>${esc(s.userId || '-')}</code></td>
            <td><strong>${esc(s.productName || '-')}</strong><br><span style="font-size:0.75rem;color:var(--text-muted)">${esc(s.shopName || '')}</span></td>
            <td>${fieldLines}</td>
            <td>${ssBadge}</td>
            <td><span style="font-size:0.82rem">${formatDate(s.submittedAt)}</span></td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteWarrantySubmission('${esc(orderId)}')">🗑️</button>
            </td>
        </tr>`;
    });

    wc.innerHTML = html + '</tbody></table></div>';
}

async function deleteWarrantySubmission(orderId) {
    if (!confirm('Hapus riwayat submisi ini?')) return;
    const res = await api(`/warranties/submissions/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
    if (res.error) return showToast(res.error, 'error');
    showToast('Submisi dihapus!');
    renderWarranty();
}

async function renderClaimTickets() {
    const tickets = await api('/claims');
    const wc = document.getElementById('warranty-content');
    const entries = Object.entries(tickets);

    if (!entries.length) {
        wc.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎫</div><div class="empty-state-text">Belum ada tiket komplain.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>🎫 Tiket Komplain (${entries.length})</h3></div>
        <table class="data-table">
            <thead><tr><th>Ticket ID</th><th>User</th><th>Produk</th><th>Order ID</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
            <tbody>`;

    entries.forEach(([ticketId, t]) => {
        const shortTicket = ticketId.substring(0, 10);
        const shortOrder  = (t.orderId || '').substring(0, 12) + '…';

        const statusBadge = t.status === 'open'
            ? `<span class="badge badge-green">🟢 Terbuka</span>`
            : `<span class="badge" style="background:var(--bg-input);color:var(--text-muted)">🔒 Ditutup</span>`;

        html += `<tr>
            <td><code title="${esc(ticketId)}">${shortTicket}</code></td>
            <td><code>${esc(t.userId || '-')}</code></td>
            <td><strong>${esc(t.productName || '-')}</strong><br><span style="font-size:0.75rem;color:var(--text-muted)">${esc(t.shopName || '')}</span></td>
            <td><code title="${esc(t.orderId || '')}">${shortOrder}</code></td>
            <td>${statusBadge}</td>
            <td><span style="font-size:0.82rem">${formatDate(t.createdAt)}</span><br><span style="font-size:0.75rem;color:var(--text-muted)">${timeAgo(t.createdAt)}</span></td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteClaimTicket('${esc(ticketId)}')">🗑️</button>
            </td>
        </tr>`;
    });

    wc.innerHTML = html + '</tbody></table></div>';
}

async function deleteClaimTicket(ticketId) {
    if (!confirm('Hapus tiket komplain ini dari database?')) return;
    const res = await api(`/claims/${encodeURIComponent(ticketId)}`, { method: 'DELETE' });
    if (res.error) return showToast(res.error, 'error');
    showToast('Tiket dihapus!');
    renderWarranty();
}

// ========== RENEWAL ==========
let renewalTab = 'tracking';

const STATUS_LABELS = {
    'watching':        { text: '👁️ Watching',         cls: 'badge-blue'   },
    'admin-notified':  { text: '🔔 Menunggu Admin',    cls: 'badge-yellow' },
    'admin-approved':  { text: '✅ Admin Setuju',       cls: 'badge-green'  },
    'buyer-notified':  { text: '📨 Menunggu Buyer',    cls: 'badge-blue'   },
    'buyer-declined':  { text: '❌ Buyer Tolak',        cls: ''             },
    'admin-rejected':  { text: '❌ Admin Tolak',        cls: ''             },
    'payment-pending': { text: '💳 Menunggu Bayar',    cls: 'badge-yellow' },
    'completed':       { text: '✅ Selesai',            cls: 'badge-green'  },
    'no-response':     { text: '⏰ Tidak Ada Respons',  cls: ''             },
};

async function renderRenewal() {
    const content = document.getElementById('page-content');
    content.innerHTML = `
        <div class="settings-tabs" style="display:flex;gap:4px;margin-bottom:24px;background:var(--bg-card);padding:4px;border-radius:var(--radius-md);border:1px solid var(--border-color);width:fit-content">
            <button class="settings-tab ${renewalTab==='tracking'?'active':''}" onclick="renewalTab='tracking';renderRenewal()">📋 Renewal Aktif</button>
            <button class="settings-tab ${renewalTab==='configs'?'active':''}" onclick="renewalTab='configs';renderRenewal()">⚙️ Konfigurasi Produk</button>
        </div>
        <div id="renewal-content"><div class="loading"><div class="spinner"></div></div></div>
    `;
    if (renewalTab === 'tracking') await renderRenewalTracking();
    else await renderRenewalConfigs();
}

async function renderRenewalTracking() {
    const rc = document.getElementById('renewal-content');
    const [tracking, submissions] = await Promise.all([
        api('/renewal/tracking'),
        api('/warranties/submissions').catch(() => ({})),
    ]);

    const entries = Object.entries(tracking || {});

    if (!entries.length) {
        rc.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔄</div><div class="empty-state-text">Tidak ada data renewal saat ini.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>📋 Renewal Aktif (${entries.length})</h3>
            <button class="btn btn-sm" onclick="renderRenewal()">🔄 Refresh</button>
        </div>
        <table class="data-table">
            <thead><tr><th>Order ID</th><th>User</th><th>Produk</th><th>Expired</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
            <tbody>`;

    entries.forEach(([orderId, r]) => {
        const shortOrder = orderId.length > 14 ? orderId.substring(0, 14) + '…' : orderId;
        const sl = STATUS_LABELS[r.status] || { text: r.status, cls: '' };
        const statusBadge = `<span class="badge ${sl.cls}">${sl.text}</span>`;
        const expiryTs = r.warrantyExpiresAt ? Math.floor(new Date(r.warrantyExpiresAt).getTime() / 1000) : null;
        const expiryStr = expiryTs ? formatDate(r.warrantyExpiresAt) : '-';

        const canApprove = r.status === 'admin-notified';
        const actBtns = `
            <button class="btn btn-sm" onclick="showRenewalDetail('${esc(orderId)}')" title="Lihat Detail">📜</button>
            ${canApprove ? `
                <button class="btn btn-sm btn-primary" onclick="renewalAction('${esc(orderId)}','approve')">✅</button>
                <button class="btn btn-sm btn-danger" onclick="renewalAction('${esc(orderId)}','reject')">❌</button>
            ` : ''}
        `;

        html += `<tr>
            <td><code title="${esc(orderId)}">${esc(shortOrder)}</code></td>
            <td><code>${esc(r.userId || '-')}</code></td>
            <td><strong>${esc(r.productName || '-')}</strong><br><span style="font-size:0.75rem;color:var(--text-muted)">${esc(r.shopName || '')}</span></td>
            <td><span style="font-size:0.82rem">${esc(expiryStr)}</span></td>
            <td>${statusBadge}</td>
            <td><span style="font-size:0.82rem">${formatDate(r.createdAt)}</span></td>
            <td style="display:flex;gap:4px;">${actBtns || '-'}</td>
        </tr>`;
    });

    // ── Manual trigger card ──
    const manualCard = `<div class="card" style="margin-top:16px">
        <div class="card-header"><h3>🔧 Manual Trigger Renewal</h3></div>
        <div style="padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
            <div>
                <label style="display:block;margin-bottom:4px;font-size:0.85rem;color:var(--text-muted)">User ID</label>
                <input id="mtUserIdInput" class="input" placeholder="Discord User ID" style="width:180px">
            </div>
            <div>
                <label style="display:block;margin-bottom:4px;font-size:0.85rem;color:var(--text-muted)">Order ID</label>
                <input id="mtOrderIdInput" class="input" placeholder="Order ID" style="width:180px">
            </div>
            <div>
                <label style="display:block;margin-bottom:4px;font-size:0.85rem;color:var(--text-muted)">Expired (DD/MM/YYYY, opsional)</label>
                <input id="mtExpiryInput" class="input" placeholder="DD/MM/YYYY" style="width:140px">
            </div>
            <button class="btn btn-primary" onclick="triggerManualRenewal()">🔄 Kirim Tawaran Renewal</button>
        </div>
    </div>`;

    rc.innerHTML = html + '</tbody></table></div>' + manualCard;
}

async function renderRenewalConfigs() {
    const rc = document.getElementById('renewal-content');
    const [shops, configs] = await Promise.all([
        api('/shops'),
        api('/renewal/configs').catch(() => ({})),
    ]);

    if (!shops || !shops.length) {
        rc.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏪</div><div class="empty-state-text">Belum ada toko.</div></div>`;
        return;
    }

    let html = `<div class="data-table-wrapper">
        <div class="table-header"><h3>⚙️ Konfigurasi Renewal Per-Produk</h3></div>
        <table class="data-table">
            <thead><tr><th>Produk</th><th>Toko</th><th>Harga</th><th>Renewal</th><th>Aksi</th></tr></thead>
            <tbody>`;

    shops.forEach(shop => {
        (shop.products || []).forEach(product => {
            const config   = configs[product.id] || {};
            const enabled  = config.enabled === true;
            const badge    = enabled
                ? `<span class="badge badge-green">✅ Aktif</span>`
                : `<span class="badge" style="background:var(--bg-input);color:var(--text-muted)">❌ Nonaktif</span>`;

            html += `<tr>
                <td><strong>${esc(product.name)}</strong></td>
                <td>${esc(shop.emoji || '')} ${esc(shop.name)}</td>
                <td>Rp ${(product.price || 0).toLocaleString('id-ID')}</td>
                <td>${badge}</td>
                <td>
                    <button class="btn btn-sm ${enabled ? 'btn-danger' : 'btn-primary'}"
                        onclick="toggleRenewalConfig('${esc(product.id)}', ${!enabled})">
                        ${enabled ? '❌ Nonaktifkan' : '✅ Aktifkan'}
                    </button>
                </td>
            </tr>`;
        });
    });

    rc.innerHTML = html + '</tbody></table></div>';
}

async function renewalAction(orderId, action) {
    const label = action === 'approve' ? 'setujui' : 'tolak';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} renewal untuk order ${orderId}?`)) return;
    const res = await api('/renewal/action', {
        method: 'POST',
        body: { orderId, action },
    });
    if (res.error) return showToast(res.error, 'error');
    showToast(`Renewal berhasil di-${label}!`);
    renderRenewal();
}

async function toggleRenewalConfig(productId, enabled) {
    const res = await api(`/renewal/configs/${encodeURIComponent(productId)}`, {
        method: 'POST',
        body: { enabled },
    });
    if (res.error) return showToast(res.error, 'error');
    showToast(`Renewal ${enabled ? 'diaktifkan' : 'dinonaktifkan'}!`);
    renderRenewal();
}

async function triggerManualRenewal() {
    const userId    = document.getElementById('mtUserIdInput')?.value?.trim();
    const orderId   = document.getElementById('mtOrderIdInput')?.value?.trim();
    const expiredStr = document.getElementById('mtExpiryInput')?.value?.trim();

    if (!userId || !orderId) return showToast('User ID dan Order ID wajib diisi.', 'error');
    if (!confirm(`Kirim tawaran renewal ke user ${userId} untuk order ${orderId}?`)) return;

    const res = await api('/renewal/manual-trigger', {
        method: 'POST',
        body: { userId, orderId, expiredStr: expiredStr || '' },
    });
    if (res.error) return showToast(res.error, 'error');
    showToast('Tawaran renewal berhasil dikirim ke buyer!');
    renderRenewal();
}

async function showRenewalDetail(orderId) {
    const tracking = await api('/renewal/tracking');
    const r = tracking && tracking[orderId];
    if (!r) return showToast('Data renewal tidak ditemukan.', 'error');
    const expiryStr = r.warrantyExpiresAt ? formatDate(r.warrantyExpiresAt) : '-';
    const completedStr = r.completedAt ? formatDate(r.completedAt) : '-';
    const sl = STATUS_LABELS[r.status] || { text: r.status, cls: '' };
    const rows = [
        ['Order ID', orderId],
        ['User ID', r.userId || '-'],
        ['Produk', r.productName || '-'],
        ['Toko', r.shopName || '-'],
        ['Status', sl.text],
        ['Masa Aktif Saat Ini', expiryStr],
        ['Durasi Dipilih', r.durationDays ? `${r.durationDays} hari` : '-'],
        ['Jumlah Bayar', r.renewalAmount ? `Rp ${r.renewalAmount.toLocaleString('id-ID')}` : '-'],
        ['Renewal Order ID', r.renewalOrderId || '-'],
        ['Dibuat', formatDate(r.createdAt)],
        ['Selesai', completedStr],
        ['Manual', r.isManual ? 'Ya' : 'Tidak'],
    ];
    const tableRows = rows.map(([k, v]) => `<tr><td style="font-weight:600;padding:4px 12px 4px 0;color:var(--text-muted);white-space:nowrap">${k}</td><td style="padding:4px 0">${esc(String(v))}</td></tr>`).join('');
    const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center" onclick="this.remove()">
        <div style="background:var(--bg-card);border-radius:12px;padding:28px 32px;min-width:340px;max-width:520px;box-shadow:0 8px 40px rgba(0,0,0,.4)" onclick="event.stopPropagation()">
            <h3 style="margin:0 0 16px">📜 Detail Renewal</h3>
            <table style="width:100%;border-collapse:collapse;font-size:0.92rem">${tableRows}</table>
            <div style="margin-top:20px;text-align:right">
                <button class="btn btn-sm" onclick="this.closest('div[style]').remove()">Tutup</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

// ========== UTILITY ==========
function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

// ========== INIT ==========
loadDashboardConfig();
navigateTo('overview');
