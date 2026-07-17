// =============================================================================
// API HELPER - same-origin pi-server /v1/* client.
//
// This build of the legacy PWA is served BY the pi-server on the same origin,
// so the base URL is empty (relative) unless the user overrides the server URL.
// The x-api-key header is attached from localStorage on every call. Money in
// the API is integer minor units (cents); the UI works in decimal units, so we
// convert at the boundary (see the transactions store mappers below).
// =============================================================================
const GullakApi = {
    key() {
        return localStorage.getItem('gullak_api_key') || '';
    },
    serverUrl() {
        // Empty string => same-origin relative requests (the common case).
        return (localStorage.getItem('gullak_server_url') || '').replace(/\/$/, '');
    },
    isConnected() {
        return Boolean(this.key());
    },
    async request(path, options = {}) {
        const headers = Object.assign({}, options.headers || {});
        const key = this.key();
        if (key) headers['x-api-key'] = key;
        if (options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        const res = await fetch(`${this.serverUrl()}${path}`, { ...options, headers });
        if (res.status === 401) {
            throw new Error('Unauthorized — check your API key in Settings.');
        }
        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json())?.error || ''; } catch (_) {}
            throw new Error(detail || `Request failed (${res.status})`);
        }
        if (res.status === 204) return null;
        return res.json();
    },
    get(path) { return this.request(path, { method: 'GET' }); },
    post(path, body) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }); },
    patch(path, body) { return this.request(path, { method: 'PATCH', body: JSON.stringify(body) }); },
    del(path) { return this.request(path, { method: 'DELETE' }); },
};
window.GullakApi = GullakApi;

document.addEventListener('alpine:init', () => {

    // =========================================================================
    // CONNECTION STORE - API key + server URL, persisted in localStorage.
    // Until a key is set, the app shows a "connect" prompt (see setup store).
    // =========================================================================
    Alpine.store('connection', {
        apiKey: '',
        serverUrl: '',
        showModal: false,
        checking: false,
        error: '',

        init() {
            this.apiKey = GullakApi.key();
            this.serverUrl = GullakApi.serverUrl();
            if (!this.connected) this.showModal = true;
        },

        get connected() {
            return Boolean(GullakApi.key());
        },

        open() { this.error = ''; this.showModal = true; },
        close() { this.showModal = false; },

        async save() {
            this.error = '';
            const key = (this.apiKey || '').trim();
            const url = (this.serverUrl || '').trim().replace(/\/$/, '');
            if (!key) { this.error = 'API key is required'; return; }
            // Persist first so the health probe uses the new credentials.
            localStorage.setItem('gullak_api_key', key);
            if (url) localStorage.setItem('gullak_server_url', url);
            else localStorage.removeItem('gullak_server_url');

            this.checking = true;
            try {
                // /v1/health is auth-exempt but confirms the server URL resolves.
                await GullakApi.get('/v1/health');
                // A gated call confirms the key is actually accepted.
                await GullakApi.get('/v1/summary');
                this.showModal = false;
                Alpine.store('notify').success('Connected');
                // Refresh whatever view is active now that we have a key.
                const router = Alpine.store('router');
                if (router && router.view) Alpine.store('router').syncFromLocation();
            } catch (e) {
                this.error = e.message || 'Could not connect';
                Alpine.store('notify').error(this.error);
            } finally {
                this.checking = false;
            }
        },

        clear() {
            localStorage.removeItem('gullak_api_key');
            localStorage.removeItem('gullak_server_url');
            this.apiKey = '';
            this.serverUrl = '';
            this.open();
        },
    });

    // =========================================================================
    // PWA STORE - Service worker, install prompt, updates
    // =========================================================================
    Alpine.store('pwa', {
        deferredPrompt: null,
        canInstall: false,
        isStandalone: false,
        updateAvailable: false,
        registration: null,

        init() {
            this.isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                || window.navigator.standalone === true;

            // Skip the service worker during local development: its aggressive
            // shell caching masks HTML/JS/CSS edits behind stale copies. On
            // localhost we also proactively unregister any previously-installed
            // SW and drop its caches so a dev session always sees fresh files.
            const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);

            if ('serviceWorker' in navigator && isLocalDev) {
                navigator.serviceWorker.getRegistrations()
                    .then((regs) => regs.forEach((r) => r.unregister()))
                    .catch(() => {});
                if (window.caches) {
                    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
                }
            } else if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js')
                    .then((reg) => {
                        this.registration = reg;
                        reg.addEventListener('updatefound', () => {
                            const newWorker = reg.installing;
                            if (newWorker) {
                                newWorker.addEventListener('statechange', () => {
                                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                        this.updateAvailable = true;
                                    }
                                });
                            }
                        });
                    })
                    .catch((err) => console.warn('SW registration failed:', err));

                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                });
            }

            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                this.deferredPrompt = e;
                this.canInstall = true;
            });

            window.addEventListener('appinstalled', () => {
                this.canInstall = false;
                this.deferredPrompt = null;
                Alpine.store('notify').success('App installed successfully!');
            });
        },

        async promptInstall() {
            if (!this.deferredPrompt) return false;
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            this.deferredPrompt = null;
            if (outcome === 'accepted') {
                this.canInstall = false;
            }
            return outcome === 'accepted';
        },

        applyUpdate() {
            if (this.registration && this.registration.waiting) {
                this.registration.waiting.postMessage('skipWaiting');
            }
        }
    });

    // =========================================================================
    // ROUTER STORE - View state and navigation
    // =========================================================================
    Alpine.store('router', {
        route: { name: 'chat', params: {} },
        sidebarOpen: false,
        loading: false,
        _started: false,
        _applying: false,
        _pendingRoute: null,

        validViews: ['chat', 'transactions', 'reports', 'ledger', 'settings'],

        get view() {
            return this.route.name === 'settings' ? 'setup' : this.route.name;
        },

        parseHash(rawHash) {
            const hash = (rawHash || '').replace(/^#/, '') || 'chat';

            if (hash.startsWith('chat/')) {
                return { name: 'chat', params: { threadId: hash.slice(5) } };
            }

            if (this.validViews.includes(hash)) {
                return { name: hash, params: {} };
            }

            return { name: 'chat', params: {} };
        },

        toHash(route) {
            if (route.name === 'chat' && route.params?.threadId) {
                return `#chat/${route.params.threadId}`;
            }
            return `#${route.name}`;
        },

        start() {
            if (this._started) return;
            this._started = true;

            window.addEventListener('hashchange', () => this.syncFromLocation());
            this.syncFromLocation();
        },

        toggleSidebar() {
            this.sidebarOpen = !this.sidebarOpen;
        },

        closeSidebar() {
            this.sidebarOpen = false;
        },

        navigate(name, params = {}) {
            this.sidebarOpen = false;
            const next = { name, params };
            const targetHash = this.toHash(next);

            if (this._applying) {
                this._pendingRoute = next;
                if (window.location.hash !== targetHash) {
                    window.location.hash = targetHash.slice(1);
                }
                return;
            }

            this._pendingRoute = null;

            if (window.location.hash === targetHash) {
                this.apply(next);
            } else {
                window.location.hash = targetHash.slice(1);
            }
        },

        syncFromLocation() {
            const next = this.parseHash(window.location.hash);
            this.apply(next);
        },

        async apply(nextRoute) {
            if (this._applying) return;

            this._applying = true;
            this.loading = true;

            try {
                const setup = Alpine.store('setup');

                if (!setup.complete && nextRoute.name !== 'settings') {
                    this.route = { name: 'settings', params: {} };
                    if (window.location.hash !== '#settings') {
                        window.location.hash = 'settings';
                    }
                    return;
                }

                this.route = nextRoute;

                if (nextRoute.name === 'chat') {
                    await this._applyChatRoute(nextRoute.params);
                } else if (nextRoute.name === 'transactions') {
                    await Alpine.store('transactions').load();
                    await Alpine.store('pending').load();
                } else if (nextRoute.name === 'reports') {
                    await Alpine.store('reports').load();
                } else if (nextRoute.name === 'ledger') {
                    await Alpine.store('ledger').load();
                } else if (nextRoute.name === 'settings') {
                    await Alpine.store('setup').loadOptions();
                    await Alpine.store('whatsapp').checkStatus();
                }
            } finally {
                this._applying = false;
                this.loading = false;

                if (this._pendingRoute) {
                    const pending = this._pendingRoute;
                    this._pendingRoute = null;
                    this.navigate(pending.name, pending.params);
                }
            }
        },

        async _applyChatRoute(params) {
            const threads = Alpine.store('threads');
            const pending = Alpine.store('pending');

            if (threads.list.length === 0) {
                await threads.load();
            }

            pending.load();

            const requestedId = params.threadId;
            const targetId = requestedId || (threads.list[0]?.id ?? null);

            if (targetId && threads.currentId !== targetId) {
                await threads.switch(targetId, { skipHashUpdate: true });
            }

            if (targetId && requestedId !== targetId) {
                this.route = { name: 'chat', params: { threadId: targetId } };
                const canonical = this.toHash(this.route);
                if (window.location.hash !== canonical) {
                    history.replaceState(null, '', canonical);
                }
            }
        }
    });

    // =========================================================================
    // THEME STORE - Dark/light mode
    // =========================================================================
    Alpine.store('theme', {
        current: 'light',

        init() {
            const saved = localStorage.getItem('theme');
            if (saved === 'gullak-dark') this.current = 'dark';
            else if (saved === 'gullak') this.current = 'light';
            else this.current = saved || 'light';
            this.apply();
        },

        toggle() {
            this.current = this.current === 'light' ? 'dark' : 'light';
            localStorage.setItem('theme', this.current);
            this.apply();
        },

        apply() {
            document.documentElement.setAttribute('data-theme', this.current);
            if (document.body) {
                document.body.setAttribute('data-theme', this.current);
            }
        },

        isDark() {
            return this.current === 'dark';
        }
    });

    // =========================================================================
    // NOTIFY STORE - Toast notifications
    // =========================================================================
    Alpine.store('notify', {
        show(type, message, action = null) {
            window.dispatchEvent(new CustomEvent('notify', {
                detail: { id: Date.now(), type, message, action }
            }));
        },
        success(msg, action) { this.show('success', msg, action); },
        error(msg) { this.show('error', msg); },
        info(msg) { this.show('info', msg); }
    });

    // =========================================================================
    // SETUP STORE - Setup wizard and settings
    // =========================================================================
    Alpine.store('setup', {
        complete: true,
        step: 'welcome',
        options: null,
        loading: false,
        data: {
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            bank_accounts: [],
            credit_cards: [],
            categories: [],
        },

        async checkStatus() {
            // The legacy /api/setup/* endpoints are gone. Setup is always
            // considered complete on this build so the sidebar/nav render;
            // the connection store (API key modal) gates data access instead.
            this.complete = true;
        },

        async loadOptions() {
            // No server-side setup options endpoint on the pi-server backend.
            // Leave the (unused on this build) wizard options empty.
            this.options = this.options || {};
        },

        // The legacy setup wizard steps (/api/setup/*) are gone. On this build
        // setup is always complete, so these are effectively unreachable; they
        // no-op locally rather than hit a dead path.
        async submitStep() {
            this.finishSetup();
        },

        async skip() {
            this.finishSetup();
        },

        async markComplete() {
            this.finishSetup();
        },

        finishSetup() {
            this.complete = true;
            Alpine.store('router').navigate('chat');
        },

        addBank(name) {
            if (name && !this.data.bank_accounts.includes(name)) {
                this.data.bank_accounts.push(name);
            }
        },

        removeBank(name) {
            this.data.bank_accounts = this.data.bank_accounts.filter(b => b !== name);
        },

        addCard(name) {
            if (name && !this.data.credit_cards.includes(name)) {
                this.data.credit_cards.push(name);
            }
        },

        removeCard(name) {
            this.data.credit_cards = this.data.credit_cards.filter(c => c !== name);
        },

        async saveAccounts() {
            // No setup-persistence endpoint on this build; no-op.
        }
    });

    // =========================================================================
    // WHATSAPP STORE - WhatsApp integration
    // =========================================================================
    Alpine.store('whatsapp', {
        connected: false,
        status: 'stopped',
        qrLoading: false,
        qrImageUrl: null,

        // WhatsApp pairing is handled by the separate bridge, not this web UI.
        // These are no-ops on this build so nothing hits a dead /api/* path.
        async checkStatus() {
            this.connected = false;
            this.status = 'stopped';
        },

        async startSession() {
            Alpine.store('notify').info('WhatsApp linking is not available here yet');
        },

        async pollForQr() {}
    });

    // =========================================================================
    // THREADS STORE - Chat thread management
    // =========================================================================
    Alpine.store('threads', {
        list: [],
        currentId: null,
        loading: false,
        showSidebar: true,

        // Chat threads have no pi-server endpoint yet; keep the history UI
        // present but empty. A later phase will wire /v1/messages threads.
        async load() {
            this.list = [];
        },

        async create() {
            Alpine.store('notify').info('Chat is not available yet');
        },

        async switch(threadId, opts = {}) {
            this.currentId = threadId || null;
            Alpine.store('chat').messages = [];
            Alpine.store('pending').transactions = [];
            Alpine.store('router').sidebarOpen = false;
        },

        async delete(threadId) {
            this.list = this.list.filter(t => t.id !== threadId);
        }
    });

    // =========================================================================
    // CHAT STORE - Messages and streaming
    // =========================================================================
    Alpine.store('chat', {
        messages: [],
        input: '',
        streaming: false,
        streamingText: '',
        uploading: false,
        uploadingReceipt: false,
        receiptPreview: null,
        pendingMedia: null,

        // The conversational agent is the pi-server /v1/messages endpoint. It is
        // a plain request/response (not streaming): POST { text, threadId? } and
        // render the returned { threadId, reply }. The threadId is threaded back
        // on subsequent turns so the agent keeps conversation context.
        async send() {
            if (!this.input.trim() || this.streaming) return;
            if (!GullakApi.isConnected()) {
                Alpine.store('connection').open();
                return;
            }
            const userMessage = this.input.trim();
            this.input = '';
            this.messages.push({ id: Date.now(), role: 'user', content: userMessage });
            this.streaming = true;

            const threads = Alpine.store('threads');
            try {
                const body = { text: userMessage, source: 'web' };
                if (threads.currentId) body.threadId = threads.currentId;
                const res = await GullakApi.post('/v1/messages', body);
                if (res?.threadId) threads.currentId = res.threadId;
                this.messages.push({
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: res?.reply || 'No response.',
                });
            } catch (error) {
                // The local dev server has no model key, so the agent may 503.
                // Surface a graceful message inline instead of a dead bubble.
                console.error('Chat request failed:', error);
                this.messages.push({
                    id: Date.now() + 1,
                    role: 'assistant',
                    content: `AI is unavailable right now (${error.message || 'request failed'}). Try again once the server has a model configured.`,
                });
                Alpine.store('notify').error(error.message || 'AI request failed');
            } finally {
                this.streaming = false;
            }
        },

        async sendWithMedia() {
            Alpine.store('notify').info('Receipt chat is not available yet');
        },

        async _processStream(response) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            this._handleEvent(data);
                        } catch (e) {
                            console.error('Parse error:', e, line);
                        }
                    }
                }
            }
        },

        _handleEvent(event) {
            const threads = Alpine.store('threads');
            if (event.data?.thread_id && !threads.currentId) {
                threads.currentId = event.data.thread_id;
            }

            switch (event.type) {
                case 'text':
                    this.streamingText += event.content;
                    break;

                case 'preview':
                    Alpine.store('pending').handlePreview(event);
                    break;

                case 'done':
                    threads.load();
                    Alpine.store('pending').load();
                    break;

                case 'error':
                    Alpine.store('notify').error(event.content || 'An error occurred');
                    break;
            }
        },

        _finishStreaming() {
            this.streaming = false;
            if (this.streamingText) {
                this.messages.push({
                    id: Date.now(),
                    role: 'assistant',
                    content: this.streamingText
                });
                this.streamingText = '';
            }
        },

        // File/receipt import via chat is not wired on this build.
        async uploadFile(event) {
            if (event?.target) event.target.value = '';
            Alpine.store('notify').info('File import is not available yet');
        },

        async uploadReceipt(event) {
            if (event?.target) event.target.value = '';
            Alpine.store('notify').info('Receipt upload is not available yet');
        }
    });

    // =========================================================================
    // PENDING STORE - Pending transactions (previews before confirm)
    // =========================================================================
    Alpine.store('pending', {
        transactions: [],
        previewMode: 'table',
        confirming: false,
        _debounceTimers: {},

        // No server-side "pending confirmation" queue on this build (that was
        // the agent draft flow). Keep the panel present but empty; it stays
        // hidden while there are no pending items.
        async load() {
            this.transactions = [];
        },

        handlePreview(event) {
            const autoConfirmable = event.data?.auto_confirmable === true;
            
            if (autoConfirmable) {
                this.confirmOne(event.data.id, { auto: true })
                    .then((autoConfirmed) => {
                        if (!autoConfirmed) {
                            this._addPreviewIfNotExists(event);
                        }
                    });
            } else {
                this._addPreviewIfNotExists(event);
            }
        },
        
        _addPreviewIfNotExists(event) {
            const exists = this.transactions.find(p => p.data.id === event.data.id);
            if (!exists) {
                this.transactions.push(event);
            }
        },

        // The pending-confirmation lifecycle (confirm/cancel/undo/update) was
        // part of the agent draft flow, which has no pi-server endpoint yet.
        // Since load() keeps the queue empty, these are unreachable in normal
        // use, but are stubbed local-only so nothing can hit a dead /api/* path.
        async confirmOne(txnId) {
            this.transactions = this.transactions.filter(p => p.data.id !== txnId);
            return false;
        },

        async confirmAll() {
            this.transactions = [];
        },

        cancel(txnId) {
            this.transactions = this.transactions.filter(p => p.data.id !== txnId);
        },

        async cancelAll() {
            this.transactions = [];
        },

        async undo() {},

        update() {},

        _refreshTransactionsIfVisible() {
            if (Alpine.store('router').view === 'transactions') {
                Alpine.store('transactions').load();
            }
        }
    });

    // =========================================================================
    // TRANSACTIONS STORE - Confirmed transactions with computed filtering
    // =========================================================================
    Alpine.store('transactions', {
        list: [],
        stats: {},
        filteredStats: null,
        categoryStats: null,
        search: '',
        payeeFilter: '',
        categoryFilter: '',
        subCategoryFilter: '',
        mappingInputs: {},
        mappingSaving: {},
        period: 'month',
        offset: 0,
        limit: 50,
        total: 0,
        hasMore: false,
        loadingList: false,
        loadingMore: false,
        loadingStats: false,
        editing: null,
        showEditModal: false,
        deleting: false,
        swipedId: null,
        _swipeState: null,
        _searchTimer: null,
        currency: 'INR',
        _accountsById: {},
        _categoriesById: {},
        _rawList: [],

        get filtered() {
            return this.list;
        },

        // Inclusive [startDate, endDate] (YYYY-MM-DD) for the active period.
        periodRange() {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            let start;
            if (this.period === 'week') {
                start = new Date(now);
                start.setDate(now.getDate() - 6);
            } else if (this.period === 'year') {
                start = new Date(now.getFullYear(), 0, 1);
            } else {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            return { startDate: iso(start), endDate: iso(now) };
        },

        // Resolve account/category id -> display name; cached from /v1/*.
        async ensureLookups() {
            if (Object.keys(this._accountsById).length && Object.keys(this._categoriesById).length) return;
            try {
                const [acc, cat] = await Promise.all([
                    GullakApi.get('/v1/accounts'),
                    GullakApi.get('/v1/categories'),
                ]);
                this._accountsById = {};
                for (const a of (acc?.accounts || [])) this._accountsById[a.id] = a.name;
                this._categoriesById = {};
                for (const ct of (cat?.categories || [])) this._categoriesById[ct.id] = ct.name;
            } catch (e) {
                // Names are best-effort; ids still render if lookups fail.
                console.warn('lookup load failed:', e.message);
            }
        },

        // Map a pi-server transaction row (integer cents, id refs) to the shape
        // the legacy list/partials expect: { id, date, payee, amount (decimal,
        // negative = expense), currency, note, accounts: [category, account] }.
        mapRow(row) {
            const categoryName = row.categoryId ? (this._categoriesById[row.categoryId] || 'Uncategorized') : 'Uncategorized';
            const accountName = this._accountsById[row.accountId] || row.accountId;
            return {
                id: row.id,
                date: row.date,
                payee: row.payeeName || 'Unknown',
                amount: (row.amountCents || 0) / 100,
                currency: this.currency,
                note: row.notes || '',
                // First entry is treated as the category (Expenses:*) by the UI helpers.
                accounts: [`Expenses:${categoryName}`, accountName],
            };
        },

        get filtersActive() {
            return Boolean(
                this.categoryFilter ||
                this.subCategoryFilter ||
                this.payeeFilter ||
                this.search
            );
        },

        get activeStats() {
            if (!this.filtersActive) return this.stats;
            return this.filteredStats || this.stats;
        },

        get grouped() {
            const groups = {};
            for (const txn of this.filtered) {
                if (!groups[txn.date]) groups[txn.date] = [];
                groups[txn.date].push(txn);
            }
            const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
            const sorted = {};
            for (const date of sortedDates) {
                sorted[date] = groups[date];
            }
            return sorted;
        },

        buildStatsParams(options = {}) {
            const { includeSubcategory = true } = options;
            const params = new URLSearchParams();
            params.set('period', this.period);
            if (this.categoryFilter) params.set('category', this.categoryFilter);
            if (includeSubcategory && this.subCategoryFilter) {
                params.set('subcategory', this.subCategoryFilter);
            }
            if (this.payeeFilter) params.set('payee', this.payeeFilter);
            if (this.search) params.set('search', this.search);
            return params;
        },

        buildListParams(offset, limit) {
            const params = this.buildStatsParams({ includeSubcategory: true });
            params.set('limit', limit);
            params.set('offset', offset);
            return params;
        },

        async load() {
            if (!GullakApi.isConnected()) {
                Alpine.store('connection').open();
                return;
            }
            await this.ensureLookups();
            await this.loadList(true);
            await this.loadStats();
            await this.refreshFilteredStats();
        },

        async loadStats() {
            this.loadingStats = true;
            try {
                const { startDate, endDate } = this.periodRange();
                const summary = await GullakApi.get(`/v1/summary?startDate=${startDate}&endDate=${endDate}`);
                // expenseCents is negative (money out); show as positive spend.
                const totalSpent = Math.abs((summary?.expenseCents || 0) / 100);
                // Count of expense rows in the period, derived from the rows we
                // already fetched (the summary endpoint returns totals only).
                const txnCount = (this._rawList || []).filter((r) => (r.amountCents || 0) < 0).length;
                this.stats = {
                    currency: this.currency,
                    total_spent: totalSpent,
                    transaction_count: txnCount,
                    period_start: startDate,
                    period_end: endDate,
                    income: (summary?.incomeCents || 0) / 100,
                    net: (summary?.netCents || 0) / 100,
                    categories: this.deriveCategories(this._rawList),
                    top_payees: this.derivePayees(this._rawList),
                    budgets: [],
                    needs_review: [],
                };
            } catch (error) {
                console.error('Failed to load stats:', error);
                Alpine.store('notify').error('Failed to load summary');
            } finally {
                this.loadingStats = false;
            }
        },

        // Aggregate expense rows by category name for the explorer breakdown.
        deriveCategories(rows) {
            const totals = {};
            for (const row of rows || []) {
                if ((row.amountCents || 0) >= 0) continue; // expenses only
                const name = row.categoryId ? (this._categoriesById[row.categoryId] || 'Uncategorized') : 'Uncategorized';
                totals[name] = (totals[name] || 0) + Math.abs(row.amountCents) / 100;
            }
            return Object.entries(totals)
                .map(([name, amount]) => ({ name, amount, subcategories: [] }))
                .sort((a, b) => b.amount - a.amount);
        },

        derivePayees(rows) {
            const totals = {};
            const counts = {};
            for (const row of rows || []) {
                if ((row.amountCents || 0) >= 0) continue;
                const name = row.payeeName || 'Unknown';
                totals[name] = (totals[name] || 0) + Math.abs(row.amountCents) / 100;
                counts[name] = (counts[name] || 0) + 1;
            }
            return Object.entries(totals)
                .map(([name, amount]) => ({ name, amount, count: counts[name] || 0 }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 5);
        },

        // The pi-server has no server-side filtered-stats endpoint. Derive the
        // filtered totals client-side from the already-fetched, filtered rows.
        async refreshFilteredStats() {
            this.filteredStats = null;
            this.categoryStats = null;
            if (!this.filtersActive) return;

            const rawFiltered = this._rawList.filter((r) => this.matchesFilters(r));
            const expenseRows = rawFiltered.filter((r) => (r.amountCents || 0) < 0);
            const spent = expenseRows.reduce((s, r) => s + Math.abs(r.amountCents) / 100, 0);
            this.filteredStats = {
                currency: this.currency,
                total_spent: spent,
                transaction_count: expenseRows.length,
                categories: this.deriveCategories(rawFiltered),
                top_payees: this.derivePayees(rawFiltered),
            };
            if (this.categoryFilter) {
                this.categoryStats = { currency: this.currency, total_spent: spent, subcategories: [] };
            }
        },

        // Client-side filter predicate over raw pi-server rows.
        matchesFilters(row) {
            if (this.categoryFilter) {
                const name = row.categoryId ? (this._categoriesById[row.categoryId] || 'Uncategorized') : 'Uncategorized';
                if (name !== this.categoryFilter) return false;
            }
            if (this.payeeFilter && (row.payeeName || 'Unknown') !== this.payeeFilter) return false;
            if (this.search) {
                const q = this.search.toLowerCase();
                const hay = `${row.payeeName || ''} ${row.notes || ''} ${this._accountsById[row.accountId] || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        },

        // Fetch the whole period window once, then filter + paginate client-side.
        // The pi-server list endpoint has no offset, so "load more" just reveals
        // more of the already-fetched, filtered set.
        async loadList(reset = false) {
            if (this.loadingList || this.loadingMore) return;
            if (reset) {
                this.loadingList = true;
                this.list = [];
                this.offset = 0;
                this.hasMore = false;
            } else {
                this.loadingMore = true;
            }

            try {
                if (reset) {
                    const { startDate, endDate } = this.periodRange();
                    const data = await GullakApi.get(
                        `/v1/transactions?startDate=${startDate}&endDate=${endDate}&limit=1000`
                    );
                    this._rawList = data?.transactions || [];
                }
                const filtered = this._rawList.filter((r) => this.matchesFilters(r));
                this.total = filtered.length;
                const shown = reset ? this.limit : this.offset + this.limit;
                this.list = filtered.slice(0, shown).map((r) => this.mapRow(r));
                this.offset = this.list.length;
                this.hasMore = this.list.length < filtered.length;
            } catch (error) {
                console.error('Failed to load transactions:', error);
                Alpine.store('notify').error(error.message || 'Failed to load transactions');
            } finally {
                this.loadingList = false;
                this.loadingMore = false;
            }
        },

        async loadMore() {
            if (!this.hasMore || this.loadingMore || this.loadingList) return;
            await this.loadList(false);
        },

        async applyFilters() {
            await this.refreshFilteredStats();
            await this.loadList(true);
        },

        async setPeriod(newPeriod) {
            this.period = newPeriod;
            await this.load();
        },

        async setCategory(category) {
            this.categoryFilter = category;
            this.subCategoryFilter = '';
            await this.applyFilters();
        },

        async setSubCategory(subCategory) {
            this.subCategoryFilter = subCategory;
            await this.applyFilters();
        },

        async applyPayeeFilter(payee) {
            this.payeeFilter = payee;
            this.search = '';
            await this.applyFilters();
            const list = document.querySelector('[data-transactions-list]');
            if (list) {
                list.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        },

        queueFilterUpdate() {
            if (this._searchTimer) clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => {
                this.applyFilters();
            }, 350);
        },

        async clearFilters() {
            this.search = '';
            this.payeeFilter = '';
            this.categoryFilter = '';
            this.subCategoryFilter = '';
            await this.applyFilters();
        },

        prepareReviewMappings(items) {
            if (!Array.isArray(items)) return;
            for (const item of items) {
                if (!this.mappingInputs[item.payee] && item.suggested_account) {
                    this.mappingInputs[item.payee] = item.suggested_account;
                }
            }
        },

        sparklinePoints(series, width = 120, height = 40) {
            if (!Array.isArray(series) || series.length === 0) {
                const mid = (height / 2).toFixed(1);
                return `0,${mid} ${width},${mid}`;
            }

            const values = series.map(item => Number(item.amount) || 0);
            const max = Math.max(...values);
            const min = Math.min(...values);
            const range = max - min || 1;
            const step = values.length > 1 ? width / (values.length - 1) : width;

            return values.map((value, index) => {
                const x = (step * index).toFixed(1);
                const y = (height - ((value - min) / range) * height).toFixed(1);
                return `${x},${y}`;
            }).join(' ');
        },

        deltaLabel(comparison) {
            if (!comparison || !comparison.available) return '—';
            if (comparison.delta_percent === null || comparison.delta_percent === undefined) {
                return '—';
            }
            const sign = comparison.delta_percent > 0 ? '+' : '';
            return `${sign}${comparison.delta_percent.toFixed(1)}% vs prev`;
        },

        deltaClass(comparison) {
            if (!comparison || !comparison.available) return 'text-base-content/40';
            return (comparison.delta_amount || 0) >= 0 ? 'text-success' : 'text-error';
        },

        async learnPayeeMapping(payee) {
            const account = (this.mappingInputs[payee] || '').trim();
            if (!account) {
                Alpine.store('notify').error('Account is required');
                return;
            }

            // Payee->category learning has no pi-server endpoint yet. Keep the
            // affordance but no-op it so nothing hits a dead /api/* path.
            Alpine.store('notify').info('Payee mapping is not available yet');
        },

        openEdit(txn) {
            this.editing = {
                id: txn.id,
                payee: txn.payee,
                date: txn.date,
                amount: Math.abs(txn.amount),
                // Preserve the sign so a saved edit keeps expense/income polarity.
                sign: (txn.amount || 0) < 0 ? -1 : 1,
                expense_account: txn.accounts.find(a => a.startsWith('Expenses:')) || txn.accounts[0] || '',
                payment_account: txn.accounts.find(a => !a.startsWith('Expenses:')) || txn.accounts[1] || '',
                note: txn.note || ''
            };
            this.showEditModal = true;
        },

        closeEdit() {
            this.editing = null;
            this.showEditModal = false;
        },

        async saveEdit() {
            if (!this.editing) return;

            try {
                // Only payee/date/amount/note map cleanly to the pi-server row;
                // the free-text account fields have no id mapping so we leave the
                // transaction's accountId/categoryId untouched.
                const sign = this.editing.sign || -1;
                const amountCents = Math.round(Math.abs(Number(this.editing.amount) || 0) * 100) * sign;
                await GullakApi.patch(`/v1/transactions/${this.editing.id}`, {
                    payeeName: this.editing.payee || null,
                    date: this.editing.date,
                    amountCents,
                    notes: this.editing.note || null,
                });
                Alpine.store('notify').success('Transaction updated');
                this.closeEdit();
                await this.load();
            } catch (error) {
                console.error('Failed to update transaction:', error);
                Alpine.store('notify').error(error.message || 'Failed to update transaction');
            }
        },

        async delete(txnId) {
            if (!confirm('Delete this transaction?')) return;

            this.deleting = true;
            try {
                await GullakApi.del(`/v1/transactions/${txnId}`);
                Alpine.store('notify').success('Transaction deleted');
                this.swipedId = null;
                await this.load();
            } catch (error) {
                console.error('Failed to delete transaction:', error);
                Alpine.store('notify').error(error.message || 'Failed to delete transaction');
            } finally {
                this.deleting = false;
            }
        },

        handleTouchStart(e, txnId) {
            if (this.swipedId && this.swipedId !== txnId) {
                this.swipedId = null;
            }
            const touch = e.touches[0];
            this._swipeState = {
                id: txnId,
                startX: touch.clientX,
                startY: touch.clientY,
                currentX: 0,
                swiping: false
            };
        },

        handleTouchMove(e, txnId, el) {
            if (!this._swipeState || this._swipeState.id !== txnId) return;

            const touch = e.touches[0];
            const deltaX = touch.clientX - this._swipeState.startX;
            const deltaY = touch.clientY - this._swipeState.startY;

            if (!this._swipeState.swiping) {
                if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
                    this._swipeState.swiping = true;
                } else if (Math.abs(deltaY) > 10) {
                    this._swipeState = null;
                    return;
                }
            }

            if (this._swipeState.swiping) {
                e.preventDefault();
                const clampedX = Math.max(-100, Math.min(0, deltaX));
                this._swipeState.currentX = clampedX;
                el.style.transform = `translateX(${clampedX}px)`;
            }
        },

        handleTouchEnd(e, txnId, el) {
            if (!this._swipeState || this._swipeState.id !== txnId) return;

            const threshold = -50;
            if (this._swipeState.currentX < threshold) {
                el.style.transform = 'translateX(-100px)';
                this.swipedId = txnId;
            } else {
                el.style.transform = 'translateX(0)';
                this.swipedId = null;
            }
            this._swipeState = null;
        },

        closeSwipe(el) {
            if (el) el.style.transform = 'translateX(0)';
            this.swipedId = null;
        }
    });

    // =========================================================================
    // LEDGER STORE - Ledger file viewer
    // =========================================================================
    Alpine.store('ledger', {
        content: '',
        path: '',
        lines: 0,
        exists: true,
        search: '',

        // The ledger-file view is obsolete: the new backend stores data in
        // SQLite, not a plaintext ledger file. Show an empty state instead of
        // hitting a dead /api/ledger/* path.
        async load() {
            this.content = '';
            this.path = '';
            this.lines = 0;
            this.exists = false;
        }
    });

    // =========================================================================
    // REPORTS STORE - Yearly spending grid
    // =========================================================================
    Alpine.store('reports', {
        data: null,
        year: new Date().getFullYear(),
        loading: false,
        expandedCategories: {},
        drawer: {
            open: false,
            loading: false,
            category: '',
            subcategory: '',
            monthIndex: -1,
            monthName: '',
            total: 0,
            transactions: [],
            count: 0
        },

        currency: 'INR',
        _rows: [],
        _categoriesById: {},

        // Month labels for the grid columns (Jan..Dec).
        _monthLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        _monthFull: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],

        // Build the YNAB-style spend-by-category x month grid for the selected
        // year from the current API: fetch the whole year of transactions plus
        // the category name map, then aggregate client-side by categoryId x
        // month. Amounts in the API are integer minor units; we render decimals.
        async load() {
            if (!GullakApi.isConnected()) {
                Alpine.store('connection').open();
                return;
            }
            this.loading = true;
            try {
                const [txnRes, catRes] = await Promise.all([
                    GullakApi.get(`/v1/transactions?startDate=${this.year}-01-01&endDate=${this.year}-12-31&limit=5000`),
                    GullakApi.get('/v1/categories'),
                ]);
                this._categoriesById = {};
                for (const ct of (catRes?.categories || [])) this._categoriesById[ct.id] = ct.name;
                this._rows = txnRes?.transactions || [];
                this.data = this.buildGrid(this._rows);
            } catch (error) {
                console.error('Failed to load reports:', error);
                Alpine.store('notify').error(error.message || 'Failed to load reports');
                this.data = null;
            } finally {
                this.loading = false;
            }
        },

        // Aggregate expense rows into the grid shape the partial expects.
        buildGrid(rows) {
            const byCategory = {};   // name -> months[12] of decimal spend
            const monthTotals = new Array(12).fill(0);

            for (const row of rows || []) {
                if ((row.amountCents || 0) >= 0) continue; // expenses only
                const d = (row.date || '');
                const mi = Number.parseInt(d.slice(5, 7), 10) - 1;
                if (Number.isNaN(mi) || mi < 0 || mi > 11) continue;
                const name = row.categoryId ? (this._categoriesById[row.categoryId] || 'Uncategorized') : 'Uncategorized';
                const amount = Math.abs(row.amountCents) / 100;
                if (!byCategory[name]) byCategory[name] = new Array(12).fill(0);
                byCategory[name][mi] += amount;
                monthTotals[mi] += amount;
            }

            const activeMonths = monthTotals.filter((v) => v > 0).length || 1;

            const categories = Object.entries(byCategory)
                .map(([name, months]) => {
                    const total = months.reduce((s, v) => s + v, 0);
                    const spentMonths = months.filter((v) => v > 0).length || 1;
                    return {
                        name,
                        months,
                        subcategories: [],
                        total,
                        average: total / spentMonths,
                    };
                })
                .sort((a, b) => b.total - a.total);

            const grandTotal = monthTotals.reduce((s, v) => s + v, 0);

            return {
                currency: this.currency,
                available_years: this.availableYears(),
                months: this._monthLabels,
                categories,
                month_totals: monthTotals,
                grand_total: grandTotal,
                grand_average: grandTotal / activeMonths,
            };
        },

        // Offer the current year plus the two prior years for quick switching.
        availableYears() {
            const now = new Date().getFullYear();
            return [now, now - 1, now - 2];
        },

        async setYear(y) {
            this.year = y;
            this.expandedCategories = {};
            this.closeDrawer();
            await this.load();
        },

        toggleCategory(name) {
            this.expandedCategories[name] = !this.expandedCategories[name];
        },

        // Drill into a single category x month cell: show that month's expense
        // transactions for the category, mapped to the shape the list expects.
        async openDrawer(category, subcategory, monthIndex, total) {
            this.drawer.open = true;
            this.drawer.loading = false;
            this.drawer.category = category;
            this.drawer.subcategory = subcategory || '';
            this.drawer.monthIndex = monthIndex;
            this.drawer.monthName = `${this._monthFull[monthIndex]} ${this.year}`;
            this.drawer.total = total || 0;

            const txns = (this._rows || []).filter((row) => {
                if ((row.amountCents || 0) >= 0) return false;
                const d = (row.date || '');
                const mi = Number.parseInt(d.slice(5, 7), 10) - 1;
                if (mi !== monthIndex) return false;
                const name = row.categoryId ? (this._categoriesById[row.categoryId] || 'Uncategorized') : 'Uncategorized';
                return name === category;
            }).map((row) => ({
                id: row.id,
                date: row.date,
                payee: row.payeeName || 'Unknown',
                amount: Math.abs(row.amountCents) / 100,
                accounts: [`Expenses:${category}`],
            })).sort((a, b) => b.date.localeCompare(a.date));

            this.drawer.transactions = txns;
            this.drawer.count = txns.length;
        },

        closeDrawer() {
            this.drawer.open = false;
        }
    });

});


// =============================================================================
// TRANSACTIONS DASHBOARD COMPONENT - Drilldown explorer + list helpers
// =============================================================================
function transactionsDashboard() {
    return {
        get store() {
            return Alpine.store('transactions');
        },

        get stats() {
            return this.store.activeStats || {};
        },

        get totalSpent() {
            return this.stats.total_spent || 0;
        },

        get flowCategories() {
            const source = this.store.categoryFilter ? this.store.stats : this.stats;
            const total = source?.total_spent || 0;
            return this.buildFlow(source?.categories || [], total);
        },

        get categoryTotal() {
            if (!this.store.categoryFilter) return this.totalSpent || 0;
            const source = this.store.categoryStats || this.store.filteredStats || {};
            return source.total_spent || 0;
        },

        get flowSubcategories() {
            if (!this.store.categoryFilter) return [];
            const source = this.store.categoryStats || this.store.filteredStats || {};
            return this.buildFlow(source.subcategories || [], this.categoryTotal);
        },

        get flowPayees() {
            return this.stats.top_payees || [];
        },

        get budgetAlerts() {
            return (this.stats.budgets || []).filter((budget) => budget.status !== 'ok');
        },

        get breadcrumb() {
            const parts = ['All'];
            if (this.store.categoryFilter) parts.push(this.store.categoryFilter);
            if (this.store.subCategoryFilter) parts.push(this.store.subCategoryFilter);
            if (this.store.payeeFilter) parts.push(`Payee: ${this.store.payeeFilter}`);
            if (this.store.search) parts.push(`Search: ${this.store.search}`);
            return parts.join(' > ');
        },

        get activeChips() {
            const chips = [];
            if (this.store.categoryFilter) {
                chips.push({
                    type: 'category',
                    label: this.store.categoryFilter,
                    key: `cat-${this.store.categoryFilter}`
                });
            }
            if (this.store.subCategoryFilter) {
                chips.push({
                    type: 'subcategory',
                    label: this.store.subCategoryFilter,
                    key: `sub-${this.store.subCategoryFilter}`
                });
            }
            if (this.store.payeeFilter) {
                chips.push({
                    type: 'payee',
                    label: this.store.payeeFilter,
                    key: `payee-${this.store.payeeFilter}`
                });
            }
            if (this.store.search) {
                chips.push({
                    type: 'search',
                    label: `Search: ${this.store.search}`,
                    key: `search-${this.store.search}`
                });
            }
            return chips;
        },

        get hasFilters() {
            return this.store.filtersActive;
        },

        get listSummary() {
            const total = this.store.total || 0;
            const shown = this.store.list?.length || 0;
            if (!total && !shown) return '0 transactions';
            if (!total) return `${shown} transactions`;
            if (shown >= total) return `${total} transactions`;
            return `Showing ${shown} of ${total}`;
        },

        buildFlow(items, total) {
            const safeTotal = total > 0 ? total : 1;
            return items.map((item) => ({
                ...item,
                percent: Math.min(100, (item.amount / safeTotal) * 100)
            }));
        },

        buildPayees(list) {
            const totals = {};
            const counts = {};
            for (const txn of list || []) {
                const amount = Math.abs(txn.amount || 0);
                totals[txn.payee] = (totals[txn.payee] || 0) + amount;
                counts[txn.payee] = (counts[txn.payee] || 0) + 1;
            }
            return Object.entries(totals)
                .map(([name, amount]) => ({
                    name,
                    amount,
                    count: counts[name] || 0
                }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 5);
        },

        isActiveCategory(name) {
            return this.store.categoryFilter === name;
        },

        isActiveSubcategory(name) {
            return this.store.subCategoryFilter === name;
        },

        async selectCategory(name) {
            await this.store.setCategory(name);
            this.scrollToList();
        },

        async selectSubcategory(name) {
            await this.store.setSubCategory(name);
            this.scrollToList();
        },

        async selectPayee(name) {
            await this.store.applyPayeeFilter(name);
        },

        async clearFilter(type) {
            if (type === 'category') {
                await this.store.setCategory('');
                return;
            }
            if (type === 'subcategory') {
                await this.store.setSubCategory('');
                return;
            }
            if (type === 'payee') {
                this.store.payeeFilter = '';
                await this.store.applyFilters();
                return;
            }
            if (type === 'search') {
                this.store.search = '';
                await this.store.applyFilters();
            }
        },

        async clearAllFilters() {
            await this.store.clearFilters();
        },

        scrollToList() {
            const list = document.querySelector('[data-transactions-list]');
            if (list) {
                list.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };
}


// =============================================================================
// REPORTS VIEW COMPONENT - Yearly spending grid helpers
// =============================================================================
function reportsView() {
    return {
        get store() {
            return Alpine.store('reports');
        },

        get data() {
            return this.store.data;
        },

        get availableYears() {
            return this.data?.available_years || [new Date().getFullYear()];
        },

        get currency() {
            return this.data?.currency || 'INR';
        },

        fmtAmount(amount) {
            if (!amount || amount === 0) return null;
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: this.currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(amount);
        },

        fmtCompact(amount) {
            if (!amount || amount === 0) return null;
            if (amount >= 100000) {
                return (amount / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
            }
            if (amount >= 1000) {
                return (amount / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
            }
            return Math.round(amount).toLocaleString('en-IN');
        }
    };
}


// =============================================================================
// GULLAK APP COMPONENT - Thin wrapper for DOM helpers and initialization
// =============================================================================
function gullakApp() {
    return {
        async init() {
            const setup = Alpine.store('setup');
            const router = Alpine.store('router');
            const pending = Alpine.store('pending');
            const threads = Alpine.store('threads');

            await setup.checkStatus();

            if (setup.complete && threads.list.length === 0) {
                await threads.load();
            }

            router.start();

            if (setup.complete) {
                this.$nextTick(() => {
                    if (this.$refs.chatInput) {
                        this.$refs.chatInput.focus();
                    }
                });
            }

            window.addEventListener('undo-transaction', (event) => {
                if (event.detail?.id) {
                    pending.undo(event.detail.id);
                }
            });
        },

        // DOM Helpers
        scrollToBottom() {
            this.$nextTick(() => {
                const container = this.$refs.messagesContainer;
                if (container) {
                    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                }
            });
        },

        getRelativeTime(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffSec = Math.floor(diffMs / 1000);
            const diffMin = Math.floor(diffSec / 60);
            const diffHr = Math.floor(diffMin / 60);
            const diffDay = Math.floor(diffHr / 24);

            if (diffDay > 7) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (diffDay > 1) return `${diffDay}d ago`;
            if (diffDay === 1) return 'Yesterday';
            if (diffHr > 0) return `${diffHr}h ago`;
            if (diffMin > 0) return `${diffMin}m ago`;
            return 'Just now';
        },

        formatDateRelative(dateStr) {
            const [year, month, day] = dateStr.split('-').map(Number);
            const date = new Date(year, month - 1, day);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            date.setHours(0, 0, 0, 0);
            const diff = Math.floor((today - date) / (1000 * 60 * 60 * 24));

            if (diff === 0) return 'Today';
            if (diff === 1) return 'Yesterday';
            if (diff < 7) return date.toLocaleDateString('en-IN', { weekday: 'long' });
            return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
        },

        formatCurrency(amount, currency = 'INR') {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).format(amount);
        },

        getCategoryEmoji(account) {
            if (!account) return '💰';
            const cat = account.toLowerCase();
            if (cat.includes('food') || cat.includes('grocer') || cat.includes('restaurant')) return '🍽️';
            if (cat.includes('transport') || cat.includes('uber') || cat.includes('fuel')) return '🚗';
            if (cat.includes('shopping') || cat.includes('amazon')) return '🛍️';
            if (cat.includes('health') || cat.includes('medical') || cat.includes('pharmacy')) return '💊';
            if (cat.includes('entertainment') || cat.includes('movie') || cat.includes('netflix')) return '🎬';
            if (cat.includes('utility') || cat.includes('electric') || cat.includes('water')) return '💡';
            if (cat.includes('housing') || cat.includes('rent')) return '🏠';
            if (cat.includes('education') || cat.includes('book')) return '📚';
            if (cat.includes('travel') || cat.includes('hotel') || cat.includes('flight')) return '✈️';
            if (cat.includes('subscription')) return '📱';
            if (cat.includes('personal')) return '👤';
            return '💸';
        },

        getCategoryColor(account) {
            if (!account) return 'bg-base-200';
            const cat = account.toLowerCase();
            if (cat.includes('food') || cat.includes('grocer') || cat.includes('restaurant')) return 'bg-warning/15 text-warning';
            if (cat.includes('transport') || cat.includes('uber') || cat.includes('fuel')) return 'bg-info/15 text-info';
            if (cat.includes('shopping') || cat.includes('amazon')) return 'bg-secondary text-secondary-content';
            if (cat.includes('health') || cat.includes('medical') || cat.includes('pharmacy')) return 'bg-error/15 text-error';
            if (cat.includes('entertainment') || cat.includes('movie') || cat.includes('netflix')) return 'bg-primary/15 text-primary';
            if (cat.includes('utility') || cat.includes('electric') || cat.includes('water')) return 'bg-accent/15 text-accent';
            if (cat.includes('housing') || cat.includes('rent')) return 'bg-success/15 text-success';
            if (cat.includes('education') || cat.includes('book')) return 'bg-info/15 text-info';
            if (cat.includes('travel') || cat.includes('hotel') || cat.includes('flight')) return 'bg-success/15 text-success';
            if (cat.includes('subscription')) return 'bg-primary/15 text-primary';
            if (cat.includes('personal')) return 'bg-secondary text-secondary-content';
            return 'bg-base-200';
        },

        hasDisplayableContent(content) {
            if (!content) return false;
            if (typeof content === 'string') return content.trim().length > 0;
            if (Array.isArray(content)) {
                return content.some(p => p.type === 'text' && p.text?.trim());
            }
            if (typeof content === 'object') {
                if (content.type === 'tool_result') return false;
                return content.text?.trim().length > 0;
            }
            return false;
        },

        formatMessage(text) {
            if (!text) return '';
            if (typeof text !== 'string') {
                if (Array.isArray(text)) {
                    const textParts = text.filter(p => p.type === 'text').map(p => p.text);
                    text = textParts.join('') || '';
                } else if (typeof text === 'object') {
                    text = text.text || '';
                } else {
                    text = String(text);
                }
            }
            if (!text) return '';

            text = text.replace(/```ledger\n([\s\S]*?)```/g, (match, code) => {
                const highlighted = this.highlightLedger(code.trim());
                return `<div class="ledger-block mt-3"><pre class="text-[13px] leading-relaxed">${highlighted}</pre></div>`;
            });

            text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<div class="ledger-block mt-3"><pre class="text-[13px] leading-relaxed">${this.escapeHtml(code.trim())}</pre></div>`;
            });

            return text
                .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
                .replace(/\n/g, '<br>');
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        highlightLedger(text) {
            if (!text) return '';
            return text
                .replace(/^(\d{4}\/\d{2}\/\d{2})/gm, '<span class="ledger-date">$1</span>')
                .replace(/(<span class="ledger-date">.*?<\/span>)\s*([*!]?\s*)(.+)$/gm,
                    '$1 $2<span class="ledger-payee">$3</span>')
                .replace(/^(\s*;.*)$/gm, '<span class="ledger-comment">$1</span>')
                .replace(/^(\s+)([A-Z][a-zA-Z:]+)/gm, '$1<span class="ledger-account">$2</span>')
                .replace(/(-?[\d,_.]+)\s+([A-Z]{3})/g, '<span class="ledger-amount">$1 $2</span>');
        }
    };
}
