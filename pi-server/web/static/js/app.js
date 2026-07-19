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

    // Multipart upload (holdings xlsx, desire photos). We deliberately do NOT set
    // Content-Type — the browser sets the multipart boundary itself.
    async upload(path, file, field = 'file') {
        const fd = new FormData();
        fd.append(field, file);
        const headers = {};
        const key = this.key();
        if (key) headers['x-api-key'] = key;
        const res = await fetch(`${this.serverUrl()}${path}`, { method: 'POST', body: fd, headers });
        if (res.status === 401) throw new Error('Unauthorized — check your API key in Settings.');
        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json())?.error || ''; } catch (_) {}
            throw new Error(detail || `Upload failed (${res.status})`);
        }
        if (res.status === 204) return null;
        return res.json();
    },

    // Fetch protected image bytes with the api key and return an object URL.
    // <img> cannot send x-api-key, so we fetch → blob → createObjectURL.
    async blobUrl(path) {
        const headers = {};
        const key = this.key();
        if (key) headers['x-api-key'] = key;
        const res = await fetch(`${this.serverUrl()}${path}`, { headers });
        if (!res.ok) throw new Error(`Image failed (${res.status})`);
        const blob = await res.blob();
        return URL.createObjectURL(blob);
    },
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

        validViews: ['accounts', 'transactions', 'insights', 'chat', 'settings', 'goals', 'holdings', 'desires'],

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
                    Alpine.store('netWorth').load();
                } else if (nextRoute.name === 'goals') {
                    await Alpine.store('goals').load();
                } else if (nextRoute.name === 'holdings') {
                    await Alpine.store('holdings').load();
                } else if (nextRoute.name === 'desires') {
                    await Alpine.store('profiles').load();
                    await Alpine.store('desires').load();
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
                const body = { text: userMessage, source: 'web', context: buildContext() };
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
        allocation: [],      // [{ label, cents, percent }] equity/MF/cash (M5)
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
                await this.loadAllocation();
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

        // Allocation split: equity vs MF (from /v1/holdings currentCents) vs cash
        // (from /v1/net-worth). Both are M5 endpoints that may not be live yet;
        // on any failure we leave allocation empty and the section stays hidden.
        async loadAllocation() {
            try {
                const [hRes, nRes] = await Promise.all([
                    GullakApi.get('/v1/holdings').catch(() => null),
                    GullakApi.get('/v1/net-worth').catch(() => null),
                ]);
                const holdings = hRes?.holdings || [];
                if (!holdings.length) { this.allocation = []; return; }
                let equity = 0, mf = 0;
                for (const h of holdings) {
                    if (h.stale) continue;
                    if (h.kind === 'mutual_fund') mf += (h.currentCents || 0);
                    else equity += (h.currentCents || 0);
                }
                const cash = nRes?.cashCents || 0;
                const parts = [
                    { label: 'Equity', cents: equity },
                    { label: 'Mutual funds', cents: mf },
                    { label: 'Cash', cents: cash },
                ].filter((p) => p.cents > 0);
                const total = parts.reduce((s, p) => s + p.cents, 0) || 1;
                this.allocation = parts.map((p) => ({ ...p, percent: (p.cents / total) * 100 }));
            } catch (_) {
                this.allocation = [];
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

    // =========================================================================
    // PROFILES STORE (M5) - lightweight two-person attribution, no auth.
    // Active person persists in localStorage; person-stamped writes read it.
    // =========================================================================
    Alpine.store('profiles', {
        list: [],
        activeId: null,
        loaded: false,

        init() {
            this.activeId = localStorage.getItem('gullak_person') || null;
        },

        get active() {
            return this.list.find((p) => p.id === this.activeId) || this.list[0] || null;
        },

        async load() {
            if (this.loaded) return;
            try {
                const res = await GullakApi.get('/v1/profiles');
                this.list = res?.profiles || [];
            } catch (_) {
                // Server not updated yet — sensible household defaults so the
                // picker still works and single-person flows don't break.
                this.list = [
                    { id: 'karan', name: 'Karan', emoji: '🧔' },
                    { id: 'wife', name: 'Wife', emoji: '💁‍♀️' },
                ];
            }
            if (!this.activeId || !this.list.find((p) => p.id === this.activeId)) {
                this.activeId = this.list[0]?.id || null;
                if (this.activeId) localStorage.setItem('gullak_person', this.activeId);
            }
            this.loaded = true;
        },

        setActive(id) {
            this.activeId = id;
            localStorage.setItem('gullak_person', id);
        },
    });

    // =========================================================================
    // NET-WORTH STORE (M5) - cash + investments blended headline.
    // Collapses gracefully when /v1/net-worth is not deployed yet (404/501).
    // =========================================================================
    Alpine.store('netWorth', {
        data: null,
        unavailable: false,

        get investedPnlPct() {
            const inv = this.data?.investedInvestedCents || 0;
            return inv ? ((this.data.investedPnlCents || 0) / inv) * 100 : 0;
        },

        async load() {
            if (!GullakApi.isConnected()) return;
            try {
                this.data = await GullakApi.get('/v1/net-worth');
                this.unavailable = false;
            } catch (e) {
                if (/\((404|501)\)/.test(e.message)) this.unavailable = true;
                this.data = null;
            }
        },
    });

    // =========================================================================
    // HOLDINGS STORE (M5) - Kite/Coin xlsx import + register table.
    // Prices are as-of-import; no live refresh (see issue 05 non-goals).
    // =========================================================================
    Alpine.store('holdings', {
        list: [],
        goals: [],          // for the inline goal-mapping combobox
        summary: { investedCents: 0, currentCents: 0, pnlCents: 0, count: 0, lastImportAt: null },
        loading: false,
        importing: false,
        unavailable: false,
        missing: [],        // rows in DB but not in latest file (sold?)
        showMissing: false,
        editingGoalFor: null,
        goalQuery: '',

        get pnlPct() {
            const inv = this.summary.investedCents || 0;
            return inv ? (this.summary.pnlCents / inv) * 100 : 0;
        },

        async load() {
            if (!GullakApi.isConnected()) { Alpine.store('connection').open(); return; }
            this.loading = true;
            this.unavailable = false;
            try {
                const res = await GullakApi.get('/v1/holdings');
                this.list = (res?.holdings || []).slice().sort((a, b) => (b.currentCents || 0) - (a.currentCents || 0));
                if (res?.summary) this.summary = res.summary;
                try {
                    const g = await GullakApi.get('/v1/goals');
                    this.goals = (g?.goals || []).filter((x) => !x.archived);
                } catch (_) { this.goals = []; }
            } catch (e) {
                if (/\((404|501)\)/.test(e.message)) { this.unavailable = true; this.list = []; }
                else Alpine.store('notify').error(e.message || 'Failed to load holdings');
            } finally {
                this.loading = false;
            }
        },

        async importFile(event) {
            const file = event?.target?.files?.[0];
            if (event?.target) event.target.value = '';
            if (!file) return;
            this.importing = true;
            try {
                const res = await GullakApi.upload('/v1/holdings/import', file);
                const u = res?.updated ?? 0;
                const a = res?.added ?? 0;
                this.missing = res?.missing || [];
                this.showMissing = this.missing.length > 0;
                Alpine.store('notify').success(`Updated ${u} · Added ${a} · Missing ${this.missing.length}`);
                await this.load();
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Import failed');
            } finally {
                this.importing = false;
            }
        },

        _idByIsin(isin) {
            return (this.list.find((h) => h.isin === isin) || {}).id || null;
        },

        async markStale(isin) {
            const id = this._idByIsin(isin);
            if (!id) { this.missing = this.missing.filter((m) => m.isin !== isin); return; }
            try {
                await GullakApi.patch(`/v1/holdings/${id}`, { stale: true });
                Alpine.store('notify').success('Marked stale');
                this.missing = this.missing.filter((m) => m.isin !== isin);
                await this.load();
            } catch (e) { Alpine.store('notify').error(e.message || 'Failed to mark stale'); }
        },

        async deleteMissing(isin) {
            const id = this._idByIsin(isin);
            if (!id) { this.missing = this.missing.filter((m) => m.isin !== isin); return; }
            try {
                await GullakApi.del(`/v1/holdings/${id}`);
                Alpine.store('notify').success('Deleted');
                this.missing = this.missing.filter((m) => m.isin !== isin);
                await this.load();
            } catch (e) { Alpine.store('notify').error(e.message || 'Failed to delete'); }
        },

        goalNameFor(goalId) {
            if (!goalId) return 'Set goal';
            const g = this.goals.find((x) => x.id === goalId);
            return g ? ((g.emoji ? g.emoji + ' ' : '') + g.name) : 'Set goal';
        },
        openGoalCombo(id) { this.editingGoalFor = id; this.goalQuery = ''; },
        closeGoalCombo() { this.editingGoalFor = null; this.goalQuery = ''; },
        filteredGoals() {
            const q = this.goalQuery.trim().toLowerCase();
            if (!q) return this.goals;
            return this.goals.filter((g) => g.name.toLowerCase().includes(q));
        },
        async setGoalFor(holdingId, goalId) {
            const h = this.list.find((x) => x.id === holdingId);
            if (!h) return;
            const prev = h.goalId;
            h.goalId = goalId;
            this.closeGoalCombo();
            try {
                await GullakApi.patch(`/v1/holdings/${holdingId}`, { goalId });
                Alpine.store('notify').success('Goal updated');
            } catch (e) {
                h.goalId = prev;
                Alpine.store('notify').error(e.message || 'Failed to update goal');
            }
        },
    });

    // =========================================================================
    // GOALS STORE (M5) - named targets; progress = mapped holdings vs target.
    // =========================================================================
    Alpine.store('goals', {
        list: [],
        unmappedCents: 0,
        loading: false,
        unavailable: false,
        expanded: {},
        _holdings: [],
        showModal: false,
        editing: null,
        saving: false,
        emojiOpen: false,
        form: { name: '', emoji: '🎯', targetRupees: '', targetDate: '', notes: '' },
        EMOJIS: ['🎯', '🏠', '🚗', '🎓', '🏖️', '💍', '👶', '🏦', '📈', '✈️', '🩺', '🛡️', '🎸', '💻', '🐘', '🌱'],

        async load() {
            if (!GullakApi.isConnected()) { Alpine.store('connection').open(); return; }
            this.loading = true;
            this.unavailable = false;
            try {
                const res = await GullakApi.get('/v1/goals');
                this.list = res?.goals || [];
                this.unmappedCents = res?.unmappedCents || 0;
                try {
                    const h = await GullakApi.get('/v1/holdings');
                    this._holdings = h?.holdings || [];
                } catch (_) { this._holdings = []; }
            } catch (e) {
                if (/\((404|501)\)/.test(e.message)) { this.unavailable = true; this.list = []; }
                else Alpine.store('notify').error(e.message || 'Failed to load goals');
            } finally {
                this.loading = false;
            }
        },

        holdingsFor(goalId) {
            return this._holdings
                .filter((h) => h.goalId === goalId)
                .sort((a, b) => (b.currentCents || 0) - (a.currentCents || 0));
        },
        toggleExpand(id) { this.expanded[id] = !this.expanded[id]; },

        _monthsRemaining(targetDate) {
            if (!targetDate) return 0;
            const now = new Date();
            const [y, m] = targetDate.split('-').map(Number);
            const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
            return Math.max(1, months);
        },
        monthlyNeed(g) {
            if (!g.targetDate) return 0;
            const remaining = (g.targetCents || 0) - (g.currentCents || 0);
            if (remaining <= 0) return 0;
            return Math.round(remaining / this._monthsRemaining(g.targetDate));
        },
        targetMonthLabel(g) {
            if (!g.targetDate) return '';
            const [y, m] = g.targetDate.split('-').map(Number);
            return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        },

        openCreate() {
            this.editing = null;
            this.form = { name: '', emoji: '🎯', targetRupees: '', targetDate: '', notes: '' };
            this.emojiOpen = false;
            this.showModal = true;
        },
        openEdit(g) {
            this.editing = g;
            this.form = {
                name: g.name || '',
                emoji: g.emoji || '🎯',
                targetRupees: g.targetCents ? Math.round(g.targetCents / 100) : '',
                targetDate: g.targetDate || '',
                notes: g.notes || '',
            };
            this.emojiOpen = false;
            this.showModal = true;
        },

        async save() {
            const name = this.form.name.trim();
            if (!name) return;
            this.saving = true;
            const payload = {
                name,
                emoji: this.form.emoji || null,
                targetCents: Math.round(Number(this.form.targetRupees || 0) * 100),
                targetDate: this.form.targetDate || null,
                notes: this.form.notes || null,
            };
            try {
                if (this.editing) await GullakApi.patch(`/v1/goals/${this.editing.id}`, payload);
                else await GullakApi.post('/v1/goals', payload);
                this.showModal = false;
                Alpine.store('notify').success('Goal saved');
                await this.load();
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Failed to save goal');
            } finally {
                this.saving = false;
            }
        },

        async remove(g) {
            if (!confirm(`Delete goal "${g.name}"?`)) return;
            try {
                await GullakApi.del(`/v1/goals/${g.id}`);
                Alpine.store('notify').success('Goal deleted');
                await this.load();
            } catch (e) {
                // 409 when holdings are still mapped — surface the server message.
                Alpine.store('notify').error(e.message || 'Cannot delete goal — unmap its holdings first');
            }
        },

        async unmap(holdingId) {
            try {
                await GullakApi.patch(`/v1/holdings/${holdingId}`, { goalId: null });
                await this.load();
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Failed to unmap');
            }
        },
    });

    // =========================================================================
    // DESIRES STORE (M5) - shared wishlist with brakes. Photos fetched with the
    // api key via object URLs (see GullakApi.blobUrl); revoked on reload.
    // =========================================================================
    Alpine.store('desires', {
        list: [],
        loading: false,
        unavailable: false,
        filterPerson: '',
        filterStatus: '',
        coverUrls: {},
        photoUrls: {},
        _objectUrls: [],
        showDetail: false,
        detail: null,
        detailId: null,
        commentBody: '',
        showAdd: false,
        saving: false,
        addForm: { title: '', estRupees: '', why: '' },
        affordability: null,
        recentTxns: [],

        personName(id) {
            const p = Alpine.store('profiles').list.find((x) => x.id === id);
            return p?.name || id || '—';
        },

        _revokeAll() {
            for (const u of this._objectUrls) { try { URL.revokeObjectURL(u); } catch (_) {} }
            this._objectUrls = [];
            this.coverUrls = {};
            this.photoUrls = {};
        },

        async load() {
            if (!GullakApi.isConnected()) { Alpine.store('connection').open(); return; }
            this.loading = true;
            this.unavailable = false;
            this._revokeAll();
            try {
                const q = new URLSearchParams();
                if (this.filterPerson) q.set('person', this.filterPerson);
                if (this.filterStatus) q.set('status', this.filterStatus);
                const qs = q.toString();
                const res = await GullakApi.get('/v1/desires' + (qs ? `?${qs}` : ''));
                this.list = res?.desires || [];
                this.loadAffordability();
            } catch (e) {
                if (/\((404|501)\)/.test(e.message)) { this.unavailable = true; this.list = []; }
                else Alpine.store('notify').error(e.message || 'Failed to load desires');
            } finally {
                this.loading = false;
            }
        },

        setPerson(id) { this.filterPerson = id; this.load(); },
        setStatusFilter(s) { this.filterStatus = s; this.load(); },

        loadCover(d) {
            if (!d.photoIds || !d.photoIds.length) return;
            if (this.coverUrls[d.id]) return;
            const pid = d.photoIds[0];
            GullakApi.blobUrl(`/v1/desires/${d.id}/photos/${pid}`)
                .then((url) => { this.coverUrls[d.id] = url; this._objectUrls.push(url); })
                .catch(() => {});
        },
        loadPhoto(desireId, photoId) {
            if (this.photoUrls[photoId]) return;
            GullakApi.blobUrl(`/v1/desires/${desireId}/photos/${photoId}`)
                .then((url) => { this.photoUrls[photoId] = url; this._objectUrls.push(url); })
                .catch(() => {});
        },

        async openDetail(id) {
            this.detailId = id;
            this.showDetail = true;
            this.detail = null;
            this.commentBody = '';
            this.recentTxns = [];
            try {
                this.detail = await GullakApi.get(`/v1/desires/${id}`);
                if (this.detail?.desire?.status === 'bought') this.loadRecentTxns();
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Failed to load desire');
                this.showDetail = false;
            }
        },
        closeDetail() {
            this.showDetail = false;
            this.detail = null;
            this.detailId = null;
            this.recentTxns = [];
        },

        async setStatus(id, status) {
            try {
                await GullakApi.patch(`/v1/desires/${id}`, { status });
                const d = this.list.find((x) => x.id === id);
                if (d) d.status = status;
                if (this.detail?.desire?.id === id) this.detail.desire.status = status;
                if (status === 'bought') this.loadRecentTxns();
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Failed to update status');
            }
        },

        async updateCost(rupees) {
            if (!this.detail) return;
            const cents = Math.round(Number(rupees || 0) * 100);
            try {
                await GullakApi.patch(`/v1/desires/${this.detail.desire.id}`, { estCostCents: cents });
                this.detail.desire.estCostCents = cents;
                const d = this.list.find((x) => x.id === this.detail.desire.id);
                if (d) d.estCostCents = cents;
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Failed to update cost');
            }
        },

        async uploadPhoto(event) {
            const file = event?.target?.files?.[0];
            if (event?.target) event.target.value = '';
            if (!file || !this.detail) return;
            const did = this.detail.desire.id;
            try {
                await GullakApi.upload(`/v1/desires/${did}/photos`, file);
                this.detail = await GullakApi.get(`/v1/desires/${did}`);
                Alpine.store('notify').success('Photo added');
                delete this.coverUrls[did];
                const d = this.list.find((x) => x.id === did);
                if (d) { d.photoIds = (this.detail.photos || []).map((p) => p.id); this.loadCover(d); }
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Upload failed');
            }
        },

        async addComment() {
            const body = this.commentBody.trim();
            if (!body || !this.detail) return;
            const person = Alpine.store('profiles').activeId;
            const did = this.detail.desire.id;
            try {
                await GullakApi.post(`/v1/desires/${did}/comments`, { person, body });
                this.commentBody = '';
                this.detail = await GullakApi.get(`/v1/desires/${did}`);
                const d = this.list.find((x) => x.id === did);
                if (d) d.commentCount = (this.detail.comments || []).length;
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Failed to add comment');
            }
        },

        openAdd() { this.showAdd = true; this.addForm = { title: '', estRupees: '', why: '' }; },
        async saveAdd() {
            const title = this.addForm.title.trim();
            const why = this.addForm.why.trim();
            if (!title || !why || !this.addForm.estRupees) return;
            this.saving = true;
            try {
                await GullakApi.post('/v1/desires', {
                    person: Alpine.store('profiles').activeId,
                    title,
                    estCostCents: Math.round(Number(this.addForm.estRupees) * 100),
                    why,
                });
                this.showAdd = false;
                Alpine.store('notify').success('Desire added');
                await this.load();
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Failed to add desire');
            } finally {
                this.saving = false;
            }
        },

        // Avg monthly surplus over the last 3 full months (net = income - expense),
        // computed client-side from /v1/summary. Numbers, not judgement.
        async loadAffordability() {
            try {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                const calls = [];
                for (let i = 1; i <= 3; i++) {
                    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const last = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
                    calls.push(GullakApi.get(`/v1/summary?startDate=${iso(first)}&endDate=${iso(last)}`).catch(() => null));
                }
                const sums = await Promise.all(calls);
                const nets = sums.filter(Boolean).map((s) => s.netCents || 0);
                if (!nets.length) { this.affordability = null; return; }
                const avg = Math.round(nets.reduce((a, b) => a + b, 0) / nets.length);
                this.affordability = { avgSurplusCents: avg };
            } catch (_) {
                this.affordability = null;
            }
        },
        monthsOfSurplus(estCostCents) {
            const avg = this.affordability?.avgSurplusCents || 0;
            if (avg <= 0) return null;
            return Math.max(1, Math.round((estCostCents || 0) / avg));
        },

        async loadRecentTxns() {
            if (!this.detail) return;
            const est = this.detail.desire.estCostCents || 0;
            try {
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                const res = await GullakApi.get(`/v1/transactions?startDate=${iso(start)}&endDate=${iso(now)}&limit=1000`);
                const lo = est * 0.9;
                const hi = est * 1.1;
                this.recentTxns = (res?.transactions || [])
                    .filter((t) => { const a = Math.abs(t.amountCents || 0); return a >= lo && a <= hi; })
                    .slice(0, 8);
            } catch (_) {
                this.recentTxns = [];
            }
        },
        async linkTransaction(txnId) {
            if (!this.detail) return;
            try {
                await GullakApi.patch(`/v1/desires/${this.detail.desire.id}`, { boughtTransactionId: txnId });
                this.detail.desire.boughtTransactionId = txnId;
                Alpine.store('notify').success('Transaction linked');
            } catch (e) {
                Alpine.store('notify').error(e.message || 'Failed to link transaction');
            }
        },
    });

    // =========================================================================
    // SIDEBAR STORE (M5) - always-on agent panel open/collapsed state (>=1024px).
    // =========================================================================
    Alpine.store('sidebar', {
        open: true,
        init() {
            const s = localStorage.getItem('gullak_sidebar_open');
            this.open = s === null ? true : s === 'true';
        },
        toggle() {
            this.open = !this.open;
            localStorage.setItem('gullak_sidebar_open', this.open ? 'true' : 'false');
        },
    });

});

// =============================================================================
// AGENT CONTEXT (M5) - compact "where is the user" hint sent with every chat
// message. Advisory prose for the model only; never trusted for writes.
// =============================================================================
function buildContext() {
    try {
        const router = Alpine.store('router');
        const view = router?.route?.name || 'accounts';
        const ctx = { view };
        if (view === 'transactions') {
            const t = Alpine.store('transactions');
            if (t.accountId) ctx.accountId = t.accountId;
            const r = t.periodRange?.();
            if (r?.startDate) ctx.month = r.startDate.slice(0, 7);
        } else if (view === 'desires') {
            const d = Alpine.store('desires');
            if (d.detailId) ctx.desireId = d.detailId;
        } else if (view === 'goals') {
            const g = Alpine.store('goals');
            const openId = Object.keys(g.expanded || {}).find((k) => g.expanded[k]);
            if (openId) ctx.goalId = openId;
        }
        return ctx;
    } catch (_) {
        return { view: 'accounts' };
    }
}



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

            // Load profiles early so the sidebar picker + person-stamped writes work.
            Alpine.store('profiles').load();

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

        // Signed percentage for P&L figures (integer-in, 1dp out).
        fmtPct(n) {
            const v = Number(n) || 0;
            return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
        },

        // Compact ₹ for large figures (Cr/L/K). Integer minor units in.
        fmtCentsCompact(cents) {
            const rupees = Math.round((cents || 0) / 100);
            const abs = Math.abs(rupees);
            const sign = rupees < 0 ? '-' : '';
            if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2).replace(/\.?0+$/, '')}Cr`;
            if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(2).replace(/\.?0+$/, '')}L`;
            if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, '')}K`;
            return `${sign}₹${abs.toLocaleString('en-IN')}`;
        },

        // Import timestamp label. Accepts epoch ms (number/numeric string) or a
        // date string; returns '' for anything unparseable.
        fmtEpochDate(v) {
            if (!v && v !== 0) return '';
            let d;
            if (typeof v === 'number') d = new Date(v);
            else if (/^\d+$/.test(String(v))) d = new Date(Number(v));
            else d = new Date(v);
            if (isNaN(d.getTime())) return '';
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        },

        // Per-view suggested prompt chips for the agent panel (issue 10).
        suggestedPrompts() {
            const view = Alpine.store('router')?.route?.name || 'accounts';
            const map = {
                transactions: ["What's driving spend this month?", 'Where can I cut back?'],
                goals: ['When do I hit the target at current pace?', 'Which goal is furthest behind?'],
                desires: ['Can we afford this?', "What's our surplus lately?"],
                holdings: ['How concentrated is the portfolio?', 'Equity vs MF split?'],
                accounts: ["What's my net worth?", 'How did this month go?'],
                insights: ['Summarise my spending trends', 'Biggest category this year?'],
            };
            return map[view] || map.accounts;
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

            // SECURITY: this string is rendered via x-html and comes from the
            // user or the model — escape ALL of it first, then apply the
            // markdown-ish transforms to the escaped text. Without this, a
            // message like <img src=x onerror=...> executes in the page and
            // can read the API key out of localStorage.
            text = this.escapeHtml(text);

            text = text.replace(/```ledger\n([\s\S]*?)```/g, (match, code) => {
                const highlighted = this.highlightLedger(code.trim());
                return `<div class="ledger-block mt-3"><pre class="text-[13px] leading-relaxed">${highlighted}</pre></div>`;
            });

            // Code is already HTML-escaped by the pass above — do not escape
            // again or entities render literally (&amp;lt;).
            text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<div class="ledger-block mt-3"><pre class="text-[13px] leading-relaxed">${code.trim()}</pre></div>`;
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
