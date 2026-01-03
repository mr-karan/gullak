document.addEventListener('alpine:init', () => {

    // =========================================================================
    // ROUTER STORE - View state and navigation
    // =========================================================================
    Alpine.store('router', {
        view: 'chat',
        sidebarOpen: false,

        init() {
            window.addEventListener('hashchange', () => this.handleRoute());
        },

        toggleSidebar() {
            this.sidebarOpen = !this.sidebarOpen;
        },

        closeSidebar() {
            this.sidebarOpen = false;
        },

        navigate(viewName, threadId = null) {
            this.sidebarOpen = false;
            let targetHash;
            if (viewName === 'chat' && threadId) {
                targetHash = `#chat/${threadId}`;
            } else {
                targetHash = `#${viewName}`;
            }
            
            if (window.location.hash === targetHash) {
                this.handleRoute();
            } else {
                window.location.hash = targetHash.slice(1);
            }
        },

        handleRoute() {
            const hash = window.location.hash.slice(1) || 'chat';
            const validViews = ['chat', 'transactions', 'ledger', 'settings'];
            
            let viewName = hash;
            let threadId = null;
            
            if (hash.startsWith('chat/')) {
                viewName = 'chat';
                threadId = hash.slice(5);
            }

            if (validViews.includes(viewName)) {
                this.view = viewName === 'settings' ? 'setup' : viewName;

                if (viewName === 'chat' && threadId) {
                    const threads = Alpine.store('threads');
                    if (threads.currentId !== threadId) {
                        threads.switch(threadId);
                    }
                } else if (viewName === 'transactions') {
                    Alpine.store('transactions').load();
                } else if (viewName === 'ledger') {
                    Alpine.store('ledger').load();
                } else if (viewName === 'settings') {
                    Alpine.store('setup').loadOptions();
                    Alpine.store('whatsapp').checkStatus();
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
            try {
                const response = await fetch('/api/setup/status');
                const status = await response.json();

                this.complete = status.is_complete;
                this.step = status.current_step;

                if (status.preferences) {
                    this.data.currency = status.preferences.currency || 'INR';
                    this.data.timezone = status.preferences.timezone || 'Asia/Kolkata';
                    this.data.bank_accounts = status.preferences.bank_accounts || [];
                    this.data.credit_cards = status.preferences.credit_cards || [];
                    this.data.categories = status.preferences.expense_categories || [];
                }

                if (!this.complete) {
                    Alpine.store('router').view = 'setup';
                    await this.loadOptions();
                }
            } catch (error) {
                console.error('Failed to check setup status:', error);
                this.complete = true;
            }
        },

        async loadOptions() {
            try {
                const response = await fetch('/api/setup/options');
                this.options = await response.json();
            } catch (error) {
                console.error('Failed to load setup options:', error);
            }
        },

        async submitStep() {
            this.loading = true;
            try {
                let data = {};
                if (this.step === 'welcome') {
                    data = { currency: this.data.currency, timezone: this.data.timezone };
                } else if (this.step === 'accounts') {
                    data = { bank_accounts: this.data.bank_accounts, credit_cards: this.data.credit_cards };
                } else if (this.step === 'categories') {
                    data = {
                        categories: this.data.categories.length > 0
                            ? this.data.categories
                            : this.options?.default_expense_accounts || []
                    };
                }

                const response = await fetch('/api/setup/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ step: this.step, data })
                });

                const result = await response.json();

                if (result.success) {
                    if (result.next_step === 'complete') {
                        await this.markComplete();
                        Alpine.store('notify').success(result.message);
                    } else if (result.next_step) {
                        this.step = result.next_step;
                        Alpine.store('notify').success(result.message);
                    } else {
                        this.finishSetup();
                        Alpine.store('notify').success(result.message);
                    }
                } else {
                    Alpine.store('notify').error(result.message);
                }
            } catch (error) {
                console.error('Setup step error:', error);
                Alpine.store('notify').error('Failed to save setup step');
            } finally {
                this.loading = false;
            }
        },

        async skip() {
            this.loading = true;
            try {
                const response = await fetch('/api/setup/skip', { method: 'POST' });
                const result = await response.json();
                if (result.success) {
                    this.finishSetup();
                    Alpine.store('notify').info(result.message);
                }
            } catch (error) {
                console.error('Skip setup error:', error);
                Alpine.store('notify').error('Failed to skip setup');
            } finally {
                this.loading = false;
            }
        },

        async markComplete() {
            try {
                await fetch('/api/setup/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ step: 'complete', data: {} })
                });
            } catch (error) {
                console.error('Failed to mark setup complete:', error);
            }
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
            if (!this.complete) return;
            try {
                await fetch('/api/setup/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step: 'accounts',
                        data: { bank_accounts: this.data.bank_accounts, credit_cards: this.data.credit_cards }
                    })
                });
            } catch (error) {
                console.error('Failed to save accounts:', error);
                Alpine.store('notify').error('Failed to save');
            }
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

        async checkStatus() {
            try {
                const response = await fetch('/api/whatsapp/status');
                if (response.ok) {
                    const data = await response.json();
                    this.connected = data.connected;
                    this.status = data.status || 'stopped';
                } else {
                    this.connected = false;
                    this.status = 'stopped';
                }
            } catch (error) {
                console.error('Failed to check WhatsApp status:', error);
                this.connected = false;
                this.status = 'stopped';
            }
        },

        async startSession() {
            this.qrLoading = true;
            try {
                const response = await fetch('/api/whatsapp/start', { method: 'POST' });
                if (response.ok) {
                    this.status = 'STARTING';
                    this.pollForQr();
                }
            } catch (error) {
                console.error('Failed to start WhatsApp session:', error);
            } finally {
                this.qrLoading = false;
            }
        },

        async pollForQr() {
            const maxAttempts = 30;
            let attempts = 0;

            const poll = async () => {
                attempts++;
                try {
                    const response = await fetch('/api/whatsapp/qr');
                    const contentType = response.headers.get('content-type');

                    if (contentType && contentType.includes('image')) {
                        const blob = await response.blob();
                        this.qrImageUrl = URL.createObjectURL(blob);
                        this.status = 'SCAN_QR_CODE';
                        return;
                    }

                    const data = await response.json();
                    if (data.status === 'connected') {
                        this.connected = true;
                        this.status = 'WORKING';
                        return;
                    }

                    if (attempts < maxAttempts && !this.connected) {
                        setTimeout(poll, 1000);
                    }
                } catch (error) {
                    console.error('QR poll error:', error);
                    if (attempts < maxAttempts) {
                        setTimeout(poll, 1000);
                    }
                }
            };

            poll();
        }
    });

    // =========================================================================
    // THREADS STORE - Chat thread management
    // =========================================================================
    Alpine.store('threads', {
        list: [],
        currentId: null,
        loading: false,
        showSidebar: true,

        async load() {
            this.loading = true;
            try {
                const response = await fetch('/api/threads');
                if (response.ok) {
                    this.list = await response.json();
                }
            } catch (error) {
                console.error('Failed to load threads:', error);
            } finally {
                this.loading = false;
            }
        },

        async create() {
            try {
                const response = await fetch('/api/threads', { method: 'POST' });
                if (response.ok) {
                    const thread = await response.json();
                    this.list.unshift(thread);
                    await this.switch(thread.id);
                }
            } catch (error) {
                console.error('Failed to create thread:', error);
                Alpine.store('notify').error('Failed to create new chat');
            }
        },

        async switch(threadId, opts = {}) {
            if (this.currentId === threadId && !opts.force) return;

            this.currentId = threadId;
            Alpine.store('chat').messages = [];
            Alpine.store('pending').transactions = [];
            Alpine.store('router').sidebarOpen = false;

            if (threadId) {
                const expectedHash = `chat/${threadId}`;
                const currentHash = window.location.hash.slice(1);
                if (currentHash !== expectedHash) {
                    history.replaceState(null, '', `#${expectedHash}`);
                }
            }
            
            const router = Alpine.store('router');
            if (router.view !== 'chat') {
                router.view = 'chat';
            }

            if (!threadId) return;

            try {
                const response = await fetch(`/api/threads/${threadId}/messages`);
                if (response.ok) {
                    const data = await response.json();
                    Alpine.store('chat').messages = data.messages || [];
                }
                await Alpine.store('pending').load();
            } catch (error) {
                console.error('Failed to load messages:', error);
                Alpine.store('notify').error('Failed to load messages');
            }
        },

        async delete(threadId) {
            if (!confirm('Delete this conversation?')) return;

            try {
                const response = await fetch(`/api/threads/${threadId}`, { method: 'DELETE' });
                if (response.ok) {
                    this.list = this.list.filter(t => t.id !== threadId);
                    if (this.currentId === threadId) {
                        const next = this.list[0];
                        await this.switch(next ? next.id : null);
                    }
                    Alpine.store('notify').success('Conversation deleted');
                }
            } catch (error) {
                console.error('Failed to delete thread:', error);
                Alpine.store('notify').error('Failed to delete conversation');
            }
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

        async send() {
            if (!this.input.trim() || this.streaming) return;

            const userMessage = this.input.trim();
            this.input = '';
            this.streaming = true;
            this.streamingText = '';

            this.messages.push({ id: Date.now(), role: 'user', content: userMessage });

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: userMessage,
                        thread_id: Alpine.store('threads').currentId
                    })
                });

                await this._processStream(response);
            } catch (error) {
                console.error('Chat error:', error);
                this.messages.push({
                    id: Date.now(),
                    role: 'assistant',
                    content: 'Sorry, something went wrong. Please try again.'
                });
                Alpine.store('notify').error('Connection error. Please try again.');
            } finally {
                this._finishStreaming();
            }
        },

        async sendWithMedia(filename) {
            const message = this.input.trim() || `Receipt: ${filename}`;
            this.input = '';
            this.streaming = true;
            this.streamingText = '';

            this.messages.push({ id: Date.now(), role: 'user', content: message, hasMedia: true });

            try {
                const response = await fetch('/api/chat/with-media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        thread_id: Alpine.store('threads').currentId,
                        media: this.pendingMedia
                    })
                });

                await this._processStream(response);
            } catch (error) {
                console.error('Chat with media error:', error);
                this.messages.push({
                    id: Date.now(),
                    role: 'assistant',
                    content: 'Sorry, something went wrong processing the receipt. Please try again.'
                });
                Alpine.store('notify').error('Failed to process receipt');
            } finally {
                this._finishStreaming();
            }
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

        async uploadFile(event) {
            const file = event.target.files[0];
            if (!file) return;

            this.uploading = true;
            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/chat/upload', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.success) {
                    this.input = `Import transactions from the uploaded file: ${result.filename}`;
                    await this.send();
                } else {
                    Alpine.store('notify').error(result.error || 'Upload failed');
                }
            } catch (error) {
                console.error('Upload error:', error);
                Alpine.store('notify').error('Failed to upload file');
            } finally {
                this.uploading = false;
                event.target.value = '';
            }
        },

        async uploadReceipt(event) {
            const file = event.target.files[0];
            if (!file) return;

            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
            if (!allowedTypes.includes(file.type)) {
                Alpine.store('notify').error('Only JPEG, PNG, WebP images and PDFs are supported');
                event.target.value = '';
                return;
            }

            const maxSize = file.type === 'application/pdf' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
            if (file.size > maxSize) {
                Alpine.store('notify').error(`File too large. Maximum ${maxSize / (1024 * 1024)}MB`);
                event.target.value = '';
                return;
            }

            this.uploadingReceipt = true;
            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/chat/upload-receipt', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.success) {
                    if (file.type.startsWith('image/')) {
                        this.receiptPreview = URL.createObjectURL(file);
                    }
                    this.pendingMedia = result.media;
                    await this.sendWithMedia(file.name);
                } else {
                    Alpine.store('notify').error(result.error || 'Upload failed');
                }
            } catch (error) {
                console.error('Receipt upload error:', error);
                Alpine.store('notify').error('Failed to upload receipt');
            } finally {
                this.uploadingReceipt = false;
                this.receiptPreview = null;
                this.pendingMedia = null;
                event.target.value = '';
            }
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

        async load() {
            const threadId = Alpine.store('threads').currentId;
            try {
                const url = threadId
                    ? `/api/chat/pending?thread_id=${threadId}`
                    : '/api/chat/pending';
                const response = await fetch(url);
                const pending = await response.json();
                this.transactions = pending.map(p => ({
                    type: 'preview',
                    content: p.preview,
                    data: { id: p.id, transaction: p.transaction }
                }));
            } catch (error) {
                console.error('Failed to load pending:', error);
            }
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

        async confirmOne(txnId, options = {}) {
            this.confirming = true;
            try {
                const response = await fetch('/api/chat/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transaction_id: txnId })
                });

                const result = await response.json();

                if (result.success) {
                    if (!options.auto) {
                        Alpine.store('chat').messages.push({
                            id: Date.now(),
                            role: 'assistant',
                            content: result.message
                        });
                        Alpine.store('notify').success('Transaction saved!');
                    } else {
                        Alpine.store('notify').success('Saved', {
                            label: 'Undo',
                            event: 'undo-transaction',
                            payload: { id: txnId }
                        });
                    }
                    this.transactions = this.transactions.filter(p => p.data.id !== txnId);
                    this._refreshTransactionsIfVisible();
                    return true;
                } else {
                    if (!options.auto) {
                        Alpine.store('notify').error(result.message || 'Failed to save transaction');
                    }
                    return false;
                }
            } catch (error) {
                console.error('Confirm error:', error);
                if (!options.auto) {
                    Alpine.store('notify').error('Failed to confirm transaction');
                }
                return false;
            } finally {
                this.confirming = false;
            }
        },

        async confirmAll() {
            if (this.transactions.length === 0 || this.confirming) return;

            this.confirming = true;
            try {
                const response = await fetch('/api/chat/confirm-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ thread_id: Alpine.store('threads').currentId })
                });

                const result = await response.json();

                if (result.success) {
                    Alpine.store('chat').messages.push({
                        id: Date.now(),
                        role: 'assistant',
                        content: `✓ ${result.message}`
                    });
                    Alpine.store('notify').success(result.message);
                    this.transactions = [];
                    this._refreshTransactionsIfVisible();
                } else {
                    Alpine.store('notify').error(result.message || 'Failed to confirm transactions');
                }
            } catch (error) {
                console.error('Confirm all error:', error);
                Alpine.store('notify').error('Failed to confirm transactions');
            } finally {
                this.confirming = false;
            }
        },

        cancel(txnId) {
            fetch('/api/chat/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction_id: txnId })
            }).catch(() => {});

            this.transactions = this.transactions.filter(p => p.data.id !== txnId);
        },

        async cancelAll() {
            if (this.transactions.length === 0) return;

            try {
                await fetch('/api/chat/cancel-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ thread_id: Alpine.store('threads').currentId })
                });

                this.transactions = [];
                Alpine.store('notify').info('All pending transactions cancelled');
            } catch (error) {
                console.error('Cancel all error:', error);
            }
        },

        async undo(txnId) {
            try {
                const response = await fetch('/api/chat/undo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transaction_id: txnId })
                });

                const result = await response.json();
                if (result.success) {
                    Alpine.store('notify').info('Undone');
                    this._refreshTransactionsIfVisible();
                } else {
                    Alpine.store('notify').error(result.message || 'Failed to undo');
                }
            } catch (error) {
                console.error('Undo error:', error);
                Alpine.store('notify').error('Failed to undo');
            }
        },

        update(txnId, field, value) {
            const key = `update-${txnId}`;
            if (this._debounceTimers[key]) {
                clearTimeout(this._debounceTimers[key]);
            }
            this._debounceTimers[key] = setTimeout(async () => {
                try {
                    const response = await fetch('/api/chat/update-pending', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ transaction_id: txnId, updates: { [field]: value } })
                    });

                    const result = await response.json();
                    if (result.success) {
                        const pending = this.transactions.find(p => p.data.id === txnId);
                        if (pending) {
                            pending.content = result.preview;
                        }
                    }
                } catch (error) {
                    console.error('Update pending error:', error);
                }
            }, 300);
        },

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
        search: '',
        categoryFilter: '',
        period: 'month',
        editing: null,
        showEditModal: false,
        deleting: false,
        swipedId: null,
        _swipeState: null,

        get filtered() {
            let result = [...this.list];

            if (this.search) {
                const s = this.search.toLowerCase();
                result = result.filter(t =>
                    t.payee.toLowerCase().includes(s) ||
                    t.accounts.some(a => a.toLowerCase().includes(s)) ||
                    (t.note && t.note.toLowerCase().includes(s))
                );
            }

            if (this.categoryFilter) {
                result = result.filter(t =>
                    t.accounts.some(a => a.includes(this.categoryFilter))
                );
            }

            return result;
        },

        get grouped() {
            const groups = {};
            for (const txn of this.filtered) {
                if (!groups[txn.date]) groups[txn.date] = [];
                groups[txn.date].push(txn);
            }
            return groups;
        },

        async load() {
            try {
                const response = await fetch('/api/ledger/transactions?limit=100');
                const data = await response.json();
                this.list = data.transactions || [];
                await this.loadStats();
            } catch (error) {
                console.error('Failed to load transactions:', error);
                Alpine.store('notify').error('Failed to load transactions');
            }
        },

        async loadStats() {
            try {
                const response = await fetch(`/api/ledger/stats?period=${this.period}`);
                this.stats = await response.json();
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        },

        openEdit(txn) {
            this.editing = {
                id: txn.id,
                payee: txn.payee,
                date: txn.date,
                amount: Math.abs(txn.amount),
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
                const response = await fetch(`/api/ledger/transactions/${this.editing.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        payee: this.editing.payee,
                        date: this.editing.date,
                        amount: this.editing.amount,
                        expense_account: this.editing.expense_account,
                        payment_account: this.editing.payment_account,
                        note: this.editing.note || null
                    })
                });

                const result = await response.json();
                if (result.success) {
                    Alpine.store('notify').success('Transaction updated');
                    this.closeEdit();
                    await this.load();
                } else {
                    Alpine.store('notify').error(result.error || 'Failed to update');
                }
            } catch (error) {
                console.error('Failed to update transaction:', error);
                Alpine.store('notify').error('Failed to update transaction');
            }
        },

        async delete(txnId) {
            if (!confirm('Delete this transaction?')) return;

            this.deleting = true;
            try {
                const response = await fetch(`/api/ledger/transactions/${txnId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();
                if (result.success) {
                    Alpine.store('notify').success('Transaction deleted');
                    this.swipedId = null;
                    await this.load();
                } else {
                    Alpine.store('notify').error(result.error || 'Failed to delete');
                }
            } catch (error) {
                console.error('Failed to delete transaction:', error);
                Alpine.store('notify').error('Failed to delete transaction');
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

        async load() {
            try {
                const params = new URLSearchParams();
                if (this.search) params.set('search', this.search);

                const response = await fetch(`/api/ledger/file?${params}`);
                const data = await response.json();

                this.content = data.content || '';
                this.path = data.path || '';
                this.lines = data.lines || 0;
                this.exists = data.exists !== false;
            } catch (error) {
                console.error('Failed to load ledger file:', error);
                Alpine.store('notify').error('Failed to load ledger file');
            }
        }
    });

});


// =============================================================================
// GULLAK APP COMPONENT - Thin wrapper for DOM helpers and initialization
// =============================================================================
function gullakApp() {
    return {
        async init() {
            const setup = Alpine.store('setup');
            const router = Alpine.store('router');
            const threads = Alpine.store('threads');
            const pending = Alpine.store('pending');

            await setup.checkStatus();

            if (setup.complete) {
                this.$nextTick(() => {
                    if (this.$refs.chatInput) {
                        this.$refs.chatInput.focus();
                    }
                });

                pending.load();
                await threads.load();
                
                const hash = window.location.hash.slice(1) || '';
                const deepLinkedThreadId = hash.startsWith('chat/') ? hash.slice(5) : null;
                
                if (deepLinkedThreadId && threads.list.some(t => t.id === deepLinkedThreadId)) {
                    await threads.switch(deepLinkedThreadId);
                } else if (threads.list.length > 0) {
                    await threads.switch(threads.list[0].id);
                }
                
                router.handleRoute();
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
            const date = new Date(dateStr);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
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
