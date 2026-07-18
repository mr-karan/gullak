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
        route: { name: 'accounts', params: {} },
        sidebarOpen: false,
        loading: false,
        _started: false,
        _applying: false,
        _pendingRoute: null,

        validViews: ['accounts', 'transactions', 'insights', 'chat', 'settings'],

        get view() {
            return this.route.name === 'settings' ? 'setup' : this.route.name;
        },

        parseHash(rawHash) {
            const hash = (rawHash || '').replace(/^#/, '') || 'accounts';

            if (hash.startsWith('chat/')) {
                return { name: 'chat', params: { threadId: hash.slice(5) } };
            }

            // transactions?accountId=..&uncategorized=1 — parse query into params.
            if (hash.startsWith('transactions?') || hash === 'transactions') {
                const [, qs = ''] = hash.split('?');
                const q = new URLSearchParams(qs);
                const params = {};
                if (q.get('accountId')) params.accountId = q.get('accountId');
                if (q.get('uncategorized') === '1') params.uncategorized = true;
                return { name: 'transactions', params };
            }

            if (this.validViews.includes(hash)) {
                return { name: hash, params: {} };
            }

            return { name: 'accounts', params: {} };
        },

        toHash(route) {
            if (route.name === 'chat' && route.params?.threadId) {
                return `#chat/${route.params.threadId}`;
            }
            if (route.name === 'transactions') {
                const q = new URLSearchParams();
                if (route.params?.accountId) q.set('accountId', route.params.accountId);
                if (route.params?.uncategorized) q.set('uncategorized', '1');
                const qs = q.toString();
                return qs ? `#transactions?${qs}` : '#transactions';
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
                } else if (nextRoute.name === 'accounts') {
                    await Alpine.store('accounts').load();
                } else if (nextRoute.name === 'transactions') {
                    Alpine.store('transactions').applyRouteParams(nextRoute.params);
                    await Alpine.store('transactions').load();
                } else if (nextRoute.name === 'insights') {
                    await Alpine.store('insights').load();
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
            Alpine.store('router').navigate('accounts');
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
            // No server-side thread API yet: "New Chat" just starts a fresh
            // local thread. The agent (/v1/messages) mints a threadId on the
            // first turn and send() threads it back, so nothing needs creating
            // server-side here.
            this.currentId = null;
            Alpine.store('chat').messages = [];
            Alpine.store('chat').input = '';
            Alpine.store('pending').transactions = [];
            Alpine.store('router').sidebarOpen = false;
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
        // Dense register. Server filter = date range (+ accountId when scoped).
        // Category / search / uncategorized are client-side over the window.
        rawList: [],          // pi-server rows for the fetched window
        list: [],             // mapped rows for display (all matching filters)
        search: '',
        rangeKey: 'month',    // month | last-month | 3m | year | custom
        customStart: '',
        customEnd: '',
        accountId: '',        // '' = all; set when account-scoped
        accountScoped: false, // hides Account column + shows subheader
        categoryFilter: '',   // category name ('' = all)
        uncategorizedOnly: false,
        capped: false,        // response hit the 1000 cap
        loadingList: false,
        editing: null,
        showEditModal: false,
        deleting: false,
        swipedId: null,
        _swipeState: null,
        _searchTimer: null,
        currency: 'INR',
        accounts: [],         // [{id,name,archived}]
        categoryGroups: [],   // [{ group, categories: [{id,name}] }]
        _accountsById: {},
        _categoriesById: {},
        _categoryIdByName: {},
        editingCatFor: null,  // txn id whose category combobox is open
        catQuery: '',

        // Inclusive [startDate, endDate] (YYYY-MM-DD) for the active range.
        periodRange() {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            let start, end = now;
            if (this.rangeKey === 'last-month') {
                start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                end = new Date(now.getFullYear(), now.getMonth(), 0);
            } else if (this.rangeKey === '3m') {
                start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            } else if (this.rangeKey === 'year') {
                start = new Date(now.getFullYear(), 0, 1);
            } else if (this.rangeKey === 'custom' && this.customStart && this.customEnd) {
                return { startDate: this.customStart, endDate: this.customEnd };
            } else {
                start = new Date(now.getFullYear(), now.getMonth(), 1);
            }
            return { startDate: iso(start), endDate: iso(end) };
        },

        rangeLabel() {
            return ({
                'month': 'This month',
                'last-month': 'Last month',
                '3m': 'Last 3 months',
                'year': 'This year',
                'custom': 'Custom',
            })[this.rangeKey] || 'This month';
        },

        // Apply router params (account scope / uncategorized) before load.
        applyRouteParams(params = {}) {
            if (params.accountId) {
                this.accountId = params.accountId;
                this.accountScoped = true;
            } else {
                this.accountScoped = false;
            }
            this.uncategorizedOnly = params.uncategorized === true;
        },

        get accountName() {
            return this._accountsById[this.accountId] || '';
        },

        get activeChips() {
            const chips = [];
            if (this.rangeKey !== 'month') chips.push({ type: 'range', label: this.rangeLabel() });
            if (this.accountId && !this.accountScoped) chips.push({ type: 'account', label: this.accountName });
            if (this.categoryFilter) chips.push({ type: 'category', label: this.categoryFilter });
            if (this.uncategorizedOnly) chips.push({ type: 'uncategorized', label: 'Uncategorized' });
            if (this.search) chips.push({ type: 'search', label: `“${this.search}”` });
            return chips;
        },

        clearChip(type) {
            if (type === 'range') this.rangeKey = 'month';
            else if (type === 'account') { this.accountId = ''; }
            else if (type === 'category') this.categoryFilter = '';
            else if (type === 'uncategorized') this.uncategorizedOnly = false;
            else if (type === 'search') this.search = '';
            if (type === 'range' || type === 'account') this.load();
            else this.applyFilters();
        },

        // Resolve account/category id -> display name; cached from /v1/*.
        async ensureLookups() {
            if (this.accounts.length && Object.keys(this._categoriesById).length) return;
            try {
                const [acc, cat, grp] = await Promise.all([
                    GullakApi.get('/v1/accounts'),
                    GullakApi.get('/v1/categories'),
                    GullakApi.get('/v1/category-groups'),
                ]);
                this.accounts = (acc?.accounts || []).filter((a) => !a.archived);
                this._accountsById = {};
                for (const a of (acc?.accounts || [])) this._accountsById[a.id] = a.name;
                this._categoriesById = {};
                this._categoryIdByName = {};
                for (const ct of (cat?.categories || [])) {
                    this._categoriesById[ct.id] = ct.name;
                    this._categoryIdByName[ct.name] = ct.id;
                }
                // Group categories by their category-group for the pickers.
                const groups = grp?.groups || [];
                const groupById = {};
                for (const g of groups) groupById[g.id] = { group: g.name, categories: [] };
                const ungrouped = { group: 'Other', categories: [] };
                for (const ct of (cat?.categories || [])) {
                    const bucket = groupById[ct.groupId] || ungrouped;
                    bucket.categories.push({ id: ct.id, name: ct.name });
                }
                this.categoryGroups = [...Object.values(groupById), ungrouped]
                    .filter((b) => b.categories.length);
            } catch (e) {
                console.warn('lookup load failed:', e.message);
            }
        },

        // Map a pi-server row to the display shape used by the register.
        mapRow(row) {
            const categoryName = row.categoryId ? (this._categoriesById[row.categoryId] || 'Uncategorized') : null;
            return {
                id: row.id,
                date: row.date,
                payee: row.payeeName || 'Unknown',
                amountCents: row.amountCents || 0,
                note: row.notes || '',
                location: row.locationName || '',
                accountId: row.accountId,
                account: this._accountsById[row.accountId] || '',
                categoryId: row.categoryId || null,
                category: categoryName,
                uncategorized: !row.categoryId,
            };
        },

        // Client-side filter predicate over mapped rows.
        matchesFilters(txn) {
            if (this.categoryFilter && txn.category !== this.categoryFilter) return false;
            if (this.uncategorizedOnly && !txn.uncategorized) return false;
            if (this.search) {
                const q = this.search.toLowerCase();
                const hay = `${txn.payee} ${txn.note} ${txn.location}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        },

        // Rows after client-side filters, newest first (server already sorts).
        get filtered() {
            return this.list.filter((t) => this.matchesFilters(t));
        },

        // Group filtered rows by date (desc), each with a net-cents total.
        get grouped() {
            const groups = {};
            for (const txn of this.filtered) {
                (groups[txn.date] = groups[txn.date] || []).push(txn);
            }
            return Object.keys(groups)
                .sort((a, b) => b.localeCompare(a))
                .map((date) => ({
                    date,
                    rows: groups[date],
                    netCents: groups[date].reduce((s, t) => s + t.amountCents, 0),
                }));
        },

        get resultCount() {
            return this.filtered.length;
        },

        async load() {
            if (!GullakApi.isConnected()) {
                Alpine.store('connection').open();
                return;
            }
            this.loadingList = true;
            this.capped = false;
            try {
                await this.ensureLookups();
                const { startDate, endDate } = this.periodRange();
                let path = `/v1/transactions?startDate=${startDate}&endDate=${endDate}&limit=1000`;
                if (this.accountId) path += `&accountId=${encodeURIComponent(this.accountId)}`;
                const data = await GullakApi.get(path);
                this.rawList = data?.transactions || [];
                this.capped = this.rawList.length >= 1000;
                this.list = this.rawList.map((r) => this.mapRow(r));
            } catch (error) {
                console.error('Failed to load transactions:', error);
                Alpine.store('notify').error(error.message || 'Failed to load transactions');
            } finally {
                this.loadingList = false;
            }
        },

        // Filter-only changes don't refetch (client-side over the window).
        applyFilters() { /* getters recompute reactively */ },

        setRange(key) {
            this.rangeKey = key;
            if (key !== 'custom') this.load();
        },

        applyCustomRange() {
            if (this.customStart && this.customEnd) {
                this.rangeKey = 'custom';
                this.load();
            }
        },

        setAccount(id) {
            this.accountId = id || '';
            this.load();
        },

        toggleUncategorized() {
            this.uncategorizedOnly = !this.uncategorizedOnly;
        },

        queueFilterUpdate() {
            if (this._searchTimer) clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => { this.applyFilters(); }, 250);
        },

        clearFilters() {
            this.search = '';
            this.categoryFilter = '';
            this.uncategorizedOnly = false;
        },

        // ---- Inline category edit -------------------------------------------
        openCatCombo(txnId) {
            this.editingCatFor = txnId;
            this.catQuery = '';
        },

        closeCatCombo() {
            this.editingCatFor = null;
            this.catQuery = '';
        },

        // Category groups filtered by the combobox query.
        filteredCategoryGroups() {
            const q = this.catQuery.trim().toLowerCase();
            if (!q) return this.categoryGroups;
            return this.categoryGroups
                .map((g) => ({ group: g.group, categories: g.categories.filter((c) => c.name.toLowerCase().includes(q)) }))
                .filter((g) => g.categories.length);
        },

        // Optimistic update + single PATCH; revert on failure.
        async setCategoryFor(txnId, categoryId, categoryName) {
            const txn = this.list.find((t) => t.id === txnId);
            if (!txn) return;
            const prev = { categoryId: txn.categoryId, category: txn.category, uncategorized: txn.uncategorized };
            txn.categoryId = categoryId;
            txn.category = categoryName;
            txn.uncategorized = !categoryId;
            this.closeCatCombo();
            try {
                await GullakApi.patch(`/v1/transactions/${txnId}`, { categoryId });
                Alpine.store('notify').success('Category updated');
            } catch (error) {
                txn.categoryId = prev.categoryId;
                txn.category = prev.category;
                txn.uncategorized = prev.uncategorized;
                console.error('Failed to set category:', error);
                Alpine.store('notify').error(error.message || 'Failed to update category');
            }
        },

    });

    // =========================================================================
    // ACCOUNTS STORE - Home view: per-account balances + net worth + recent.
    // Balance = openingBalanceCents + summary.netCents for the account.
    // =========================================================================
    Alpine.store('accounts', {
        list: [],            // non-archived, with computed balanceCents
        archived: [],        // archived, with computed balanceCents
        showArchived: false,
        netWorthCents: 0,
        month: { incomeCents: 0, expenseCents: 0, netCents: 0 },
        recent: [],          // last ~8 txns, mapped for display
        uncategorizedCount: 0,
        loading: false,
        currency: 'INR',
        _catById: {},
        _accById: {},

        monthRange() {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const first = new Date(now.getFullYear(), now.getMonth(), 1);
            return { startDate: iso(first), endDate: iso(now) };
        },

        async load() {
            if (!GullakApi.isConnected()) {
                Alpine.store('connection').open();
                return;
            }
            this.loading = true;
            try {
                const [accRes, catRes] = await Promise.all([
                    GullakApi.get('/v1/accounts'),
                    GullakApi.get('/v1/categories'),
                ]);
                const accounts = accRes?.accounts || [];
                this._accById = {};
                for (const a of accounts) this._accById[a.id] = a.name;
                this._catById = {};
                for (const ct of (catRes?.categories || [])) this._catById[ct.id] = ct.name;

                // Per-account net activity (summary netCents), computed in parallel.
                const summaries = await Promise.all(
                    accounts.map((a) =>
                        GullakApi.get(`/v1/summary?accountId=${encodeURIComponent(a.id)}`)
                            .catch(() => ({ netCents: 0 }))
                    )
                );
                const withBalance = accounts.map((a, i) => ({
                    ...a,
                    balanceCents: (a.openingBalanceCents || 0) + (summaries[i]?.netCents || 0),
                }));
                this.list = withBalance
                    .filter((a) => !a.archived)
                    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
                this.archived = withBalance.filter((a) => a.archived);
                this.netWorthCents = this.list.reduce((s, a) => s + a.balanceCents, 0);

                // This-month in/out/net + recent activity + uncategorized count.
                const { startDate, endDate } = this.monthRange();
                const [monthSummary, txnRes] = await Promise.all([
                    GullakApi.get(`/v1/summary?startDate=${startDate}&endDate=${endDate}`),
                    GullakApi.get(`/v1/transactions?startDate=${startDate}&endDate=${endDate}&limit=1000`),
                ]);
                this.month = {
                    incomeCents: monthSummary?.incomeCents || 0,
                    expenseCents: monthSummary?.expenseCents || 0,
                    netCents: monthSummary?.netCents || 0,
                };
                const rows = txnRes?.transactions || [];
                this.uncategorizedCount = rows.filter((r) => !r.categoryId).length;
                this.recent = rows.slice(0, 8).map((r) => ({
                    id: r.id,
                    date: r.date,
                    payee: r.payeeName || 'Unknown',
                    amountCents: r.amountCents || 0,
                    accountId: r.accountId,
                    account: this._accById[r.accountId] || '',
                    category: r.categoryId ? (this._catById[r.categoryId] || 'Uncategorized') : null,
                }));
            } catch (error) {
                console.error('Failed to load accounts:', error);
                Alpine.store('notify').error(error.message || 'Failed to load accounts');
            } finally {
                this.loading = false;
            }
        },
    });

    // =========================================================================
    // INSIGHTS STORE - Charts hub: month-over-month, spend-by-category,
    // top payees, plus the yearly category x month grid (preserved).
    // =========================================================================
    Alpine.store('insights', {
        data: null,
        year: new Date().getFullYear(),
        loading: false,
        expandedCategories: {},
        // Section state added above the grid.
        compare: null,       // { thisMonth:{income,spending,net}, lastMonth:{...}, delta:{...} }
        byCategory: [],      // [{ name, amountCents, percent }] current month, top 8
        topPayees: [],       // [{ name, amountCents }] current month, top 8
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
                    GullakApi.get(`/v1/transactions?startDate=${this.year}-01-01&endDate=${this.year}-12-31&limit=1000`),
                    GullakApi.get('/v1/categories'),
                ]);
                this._categoriesById = {};
                for (const ct of (catRes?.categories || [])) this._categoriesById[ct.id] = ct.name;
                this._rows = txnRes?.transactions || [];
                this.data = this.buildGrid(this._rows);
                await this.loadSections();
            } catch (error) {
                console.error('Failed to load insights:', error);
                Alpine.store('notify').error(error.message || 'Failed to load insights');
                this.data = null;
            } finally {
                this.loading = false;
            }
        },

        // Month labels + ranges for this month and last month.
        _monthRanges() {
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const thisFirst = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastEnd = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 = last day prev month
            return {
                thisMonth: { startDate: iso(thisFirst), endDate: iso(now) },
                lastMonth: { startDate: iso(lastFirst), endDate: iso(lastEnd) },
            };
        },

        // 1) this vs last month, 2) spend-by-category, 3) top payees (this month).
        async loadSections() {
            const { thisMonth, lastMonth } = this._monthRanges();
            const [tsum, lsum, tTxn] = await Promise.all([
                GullakApi.get(`/v1/summary?startDate=${thisMonth.startDate}&endDate=${thisMonth.endDate}`),
                GullakApi.get(`/v1/summary?startDate=${lastMonth.startDate}&endDate=${lastMonth.endDate}`),
                GullakApi.get(`/v1/transactions?startDate=${thisMonth.startDate}&endDate=${thisMonth.endDate}&limit=1000`),
            ]);
            const t = { income: tsum?.incomeCents || 0, spending: Math.abs(tsum?.expenseCents || 0), net: tsum?.netCents || 0 };
            const l = { income: lsum?.incomeCents || 0, spending: Math.abs(lsum?.expenseCents || 0), net: lsum?.netCents || 0 };
            this.compare = {
                thisMonth: t,
                lastMonth: l,
                delta: {
                    income: t.income - l.income,
                    spending: t.spending - l.spending,
                    net: t.net - l.net,
                },
            };

            const rows = tTxn?.transactions || [];
            // Spend by category (expenses only), top 8.
            const catTotals = {};
            for (const r of rows) {
                if ((r.amountCents || 0) >= 0) continue;
                const name = r.categoryId ? (this._categoriesById[r.categoryId] || 'Uncategorized') : 'Uncategorized';
                catTotals[name] = (catTotals[name] || 0) + Math.abs(r.amountCents);
            }
            const catList = Object.entries(catTotals)
                .map(([name, amountCents]) => ({ name, amountCents }))
                .sort((a, b) => b.amountCents - a.amountCents)
                .slice(0, 8);
            const catMax = catList[0]?.amountCents || 1;
            this.byCategory = catList.map((c) => ({ ...c, percent: Math.min(100, (c.amountCents / catMax) * 100) }));

            // Top payees by outflow, top 8.
            const payTotals = {};
            for (const r of rows) {
                if ((r.amountCents || 0) >= 0) continue;
                const name = r.payeeName || 'Unknown';
                payTotals[name] = (payTotals[name] || 0) + Math.abs(r.amountCents);
            }
            this.topPayees = Object.entries(payTotals)
                .map(([name, amountCents]) => ({ name, amountCents }))
                .sort((a, b) => b.amountCents - a.amountCents)
                .slice(0, 8);
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
// INSIGHTS VIEW COMPONENT - Charts hub + yearly spending grid helpers
// =============================================================================
function insightsView() {
    return {
        get store() {
            return Alpine.store('insights');
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
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(amount);
        },

        // Integer minor units -> ₹ with Indian grouping. Display layer only.
        fmtCents(cents, currency = 'INR') {
            return this.formatCurrency((cents || 0) / 100, currency);
        },

        // Signed money for balances/net rows (keeps the leading minus).
        fmtCentsSigned(cents, currency = 'INR') {
            const v = (cents || 0) / 100;
            const s = new Intl.NumberFormat('en-IN', {
                style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
            }).format(Math.abs(v));
            return v < 0 ? `-${s}` : s;
        },

        // Short day/month label for the register date column.
        fmtDayMonth(dateStr) {
            if (!dateStr) return '';
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
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
