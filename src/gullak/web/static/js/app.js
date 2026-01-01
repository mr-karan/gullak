function gullakApp() {
    return {
        view: 'chat',
        theme: localStorage.getItem('theme') || 'gullak',

        // Setup state
        setupComplete: true,
        setupStep: 'welcome',
        setupOptions: null,
        setupData: {
            currency: 'INR',
            timezone: 'Asia/Kolkata',
            bank_accounts: [],
            credit_cards: [],
            categories: [],
        },
        setupLoading: false,

        // Chat state
        messages: [],
        threads: [],
        currentThreadId: null,
        threadsLoading: false,
        showThreads: true,
        input: '',
        streaming: false,
        streamingText: '',

        // Preview state
        pendingTransactions: [],
        previewMode: 'table',
        confirming: false,
        
        // Upload state
        uploading: false,
        uploadedFilePath: null,
        
        // Debounce timers
        _debounceTimers: {},

        // Transactions state
        transactions: [],
        filteredTransactions: [],
        groupedTransactions: {},
        txnStats: {},
        txnSearch: '',
        txnCategoryFilter: '',
        txnPeriod: 'month',

        // Ledger viewer state
        ledgerContent: '',
        ledgerPath: '',
        ledgerLines: 0,
        ledgerExists: true,
        ledgerSearch: '',

        async init() {
            document.documentElement.setAttribute('data-theme', this.theme);

            await this.checkSetupStatus();

            if (this.setupComplete) {
                this.handleRoute();
                window.addEventListener('hashchange', () => this.handleRoute());

                this.$nextTick(() => {
                    if (this.$refs.chatInput) {
                        this.$refs.chatInput.focus();
                    }
                });

                this.loadPending();
                
                await this.loadThreads();
                if (this.threads.length > 0) {
                    this.switchThread(this.threads[0].id);
                }
            }
        },

        handleRoute() {
            const hash = window.location.hash.slice(1) || 'chat';
            const validViews = ['chat', 'transactions', 'ledger', 'settings'];
            
            if (validViews.includes(hash)) {
                this.view = hash === 'settings' ? 'setup' : hash;
                
                if (hash === 'transactions') {
                    this.loadTransactions();
                    this.loadTransactionStats();
                } else if (hash === 'ledger') {
                    this.loadLedgerFile();
                } else if (hash === 'settings') {
                    this.loadSetupOptions();
                }
            }
        },

        navigate(viewName) {
            window.location.hash = viewName;
        },

        // Check if setup has been completed
        async checkSetupStatus() {
            try {
                const response = await fetch('/api/setup/status');
                const status = await response.json();

                this.setupComplete = status.is_complete;
                this.setupStep = status.current_step;

                // Load existing preferences from ledger
                if (status.preferences) {
                    this.setupData.currency = status.preferences.currency || 'INR';
                    this.setupData.timezone = status.preferences.timezone || 'Asia/Kolkata';
                    this.setupData.bank_accounts = status.preferences.bank_accounts || [];
                    this.setupData.credit_cards = status.preferences.credit_cards || [];
                    this.setupData.categories = status.preferences.expense_categories || [];
                    this.setupData.income_sources = status.preferences.income_sources || [];
                }

                if (!this.setupComplete) {
                    this.view = 'setup';
                    await this.loadSetupOptions();
                }
            } catch (error) {
                console.error('Failed to check setup status:', error);
                // Assume setup is complete on error to not block the user
                this.setupComplete = true;
            }
        },

        // Load setup options (currencies, timezones, etc.)
        async loadSetupOptions() {
            try {
                const response = await fetch('/api/setup/options');
                this.setupOptions = await response.json();
            } catch (error) {
                console.error('Failed to load setup options:', error);
            }
        },

        // --- Thread Management ---

        async loadThreads() {
            this.threadsLoading = true;
            try {
                const response = await fetch('/api/threads');
                if (response.ok) {
                    this.threads = await response.json();
                }
            } catch (error) {
                console.error('Failed to load threads:', error);
            } finally {
                this.threadsLoading = false;
            }
        },

        async createThread() {
            try {
                const response = await fetch('/api/threads', { method: 'POST' });
                if (response.ok) {
                    const thread = await response.json();
                    this.threads.unshift(thread);
                    await this.switchThread(thread.id);
                }
            } catch (error) {
                console.error('Failed to create thread:', error);
                this.notify('error', 'Failed to create new chat');
            }
        },

        async switchThread(threadId) {
            if (this.currentThreadId === threadId) return;
            
            this.currentThreadId = threadId;
            this.messages = [];
            this.pendingTransactions = [];
            
            if (!threadId) return; // New Chat mode

            try {
                const response = await fetch(`/api/threads/${threadId}/messages`);
                if (response.ok) {
                    const data = await response.json();
                    this.messages = data.messages || [];
                    this.scrollToBottom();
                }
                await this.loadPending();
            } catch (error) {
                console.error('Failed to load messages:', error);
                this.notify('error', 'Failed to load messages');
            }
        },

        async deleteThread(threadId) {
            if (!confirm('Delete this conversation?')) return;
            
            try {
                const response = await fetch(`/api/threads/${threadId}`, { method: 'DELETE' });
                if (response.ok) {
                    this.threads = this.threads.filter(t => t.id !== threadId);
                    if (this.currentThreadId === threadId) {
                        const next = this.threads[0];
                        await this.switchThread(next ? next.id : null);
                    }
                    this.notify('success', 'Conversation deleted');
                }
            } catch (error) {
                console.error('Failed to delete thread:', error);
                this.notify('error', 'Failed to delete conversation');
            }
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

        // Handle setup step submission
        async submitSetupStep() {
            this.setupLoading = true;

            try {
                let data = {};

                if (this.setupStep === 'welcome') {
                    data = {
                        currency: this.setupData.currency,
                        timezone: this.setupData.timezone,
                    };
                } else if (this.setupStep === 'accounts') {
                    data = {
                        bank_accounts: this.setupData.bank_accounts,
                        credit_cards: this.setupData.credit_cards,
                    };
                } else if (this.setupStep === 'categories') {
                    data = {
                        categories: this.setupData.categories.length > 0
                            ? this.setupData.categories
                            : this.setupOptions?.default_expense_accounts || [],
                    };
                }

                const response = await fetch('/api/setup/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ step: this.setupStep, data }),
                });

                const result = await response.json();

                if (result.success) {
                    if (result.next_step === 'complete') {
                        // Mark setup as complete in backend, then switch to chat
                        await this.markSetupComplete();
                        this.notify('success', result.message);
                    } else if (result.next_step) {
                        this.setupStep = result.next_step;
                        this.notify('success', result.message);
                    } else {
                        // No next step means we're done
                        this.completeSetup();
                        this.notify('success', result.message);
                    }
                } else {
                    this.notify('error', result.message);
                }
            } catch (error) {
                console.error('Setup step error:', error);
                this.notify('error', 'Failed to save setup step');
            } finally {
                this.setupLoading = false;
            }
        },

        // Skip setup and use defaults
        async skipSetup() {
            this.setupLoading = true;

            try {
                const response = await fetch('/api/setup/skip', {
                    method: 'POST',
                });

                const result = await response.json();

                if (result.success) {
                    this.completeSetup();
                    this.notify('info', result.message);
                }
            } catch (error) {
                console.error('Skip setup error:', error);
                this.notify('error', 'Failed to skip setup');
            } finally {
                this.setupLoading = false;
            }
        },

        // Mark setup as complete in backend
        async markSetupComplete() {
            try {
                await fetch('/api/setup/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ step: 'complete', data: {} }),
                });
            } catch (error) {
                console.error('Failed to mark setup complete:', error);
            }
            this.completeSetup();
        },

        completeSetup() {
            this.setupComplete = true;
            window.location.hash = 'chat';

            this.$nextTick(() => {
                if (this.$refs.chatInput) {
                    this.$refs.chatInput.focus();
                }
            });
        },

        // Add bank account to setup
        addBankAccount(name) {
            if (name && !this.setupData.bank_accounts.includes(name)) {
                this.setupData.bank_accounts.push(name);
            }
        },

        // Remove bank account from setup
        removeBankAccount(name) {
            this.setupData.bank_accounts = this.setupData.bank_accounts.filter(b => b !== name);
        },

        // Add credit card to setup
        addCreditCard(name) {
            if (name && !this.setupData.credit_cards.includes(name)) {
                this.setupData.credit_cards.push(name);
            }
        },

        // Remove credit card from setup
        removeCreditCard(name) {
            this.setupData.credit_cards = this.setupData.credit_cards.filter(c => c !== name);
        },

        // Save accounts to ledger (for settings mode)
        async saveAccountsToLedger() {
            if (!this.setupComplete) return; // Only in settings mode

            try {
                await fetch('/api/setup/step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        step: 'accounts',
                        data: {
                            bank_accounts: this.setupData.bank_accounts,
                            credit_cards: this.setupData.credit_cards,
                        }
                    }),
                });
            } catch (error) {
                console.error('Failed to save accounts:', error);
                this.notify('error', 'Failed to save');
            }
        },

        // Open settings view
        async openSettings() {
            await this.checkSetupStatus(); // Refresh data from ledger
            await this.loadSetupOptions();
            this.view = 'setup';
        },

        // Theme toggle
        toggleTheme() {
            this.theme = this.theme === 'gullak' ? 'gullak-dark' : 'gullak';
            document.documentElement.setAttribute('data-theme', this.theme);
            localStorage.setItem('theme', this.theme);
        },

        // Check if dark mode
        isDark() {
            return this.theme === 'gullak-dark';
        },

        // Send chat message
        async sendMessage() {
            if (!this.input.trim() || this.streaming) return;

            const userMessage = this.input.trim();
            this.input = '';
            this.streaming = true;
            this.streamingText = '';

            // Add user message
            this.messages.push({
                id: Date.now(),
                role: 'user',
                content: userMessage
            });

            // Scroll to bottom
            this.scrollToBottom();

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        message: userMessage,
                        thread_id: this.currentThreadId
                    })
                });

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
                                this.handleEvent(data);
                            } catch (e) {
                                console.error('Parse error:', e, line);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Chat error:', error);
                this.messages.push({
                    id: Date.now(),
                    role: 'assistant',
                    content: 'Sorry, something went wrong. Please try again.'
                });
                this.notify('error', 'Connection error. Please try again.');
            } finally {
                this.streaming = false;
                if (this.streamingText) {
                    this.messages.push({
                        id: Date.now(),
                        role: 'assistant',
                        content: this.streamingText
                    });
                    this.streamingText = '';
                }
                this.scrollToBottom();
            }
        },

        // Handle SSE event
        handleEvent(event) {
            if (event.data?.thread_id && !this.currentThreadId) {
                this.currentThreadId = event.data.thread_id;
            }

            switch (event.type) {
                case 'text':
                    this.streamingText += event.content;
                    this.scrollToBottom();
                    break;

                case 'preview':
                    const exists = this.pendingTransactions.find(p => p.data.id === event.data.id);
                    if (!exists) {
                        this.pendingTransactions.push(event);
                    }
                    break;

                case 'thinking':
                    // Could show a thinking indicator
                    break;

                case 'tool_result':
                    // Tool results are usually followed by text
                    break;

                case 'done':
                    this.loadThreads();
                    this.loadPending();
                    break;

                case 'error':
                    this.notify('error', event.content || 'An error occurred');
                    break;
            }
        },

        async confirmTransaction(txnId) {
            this.confirming = true;

            try {
                const response = await fetch('/api/chat/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transaction_id: txnId })
                });

                const result = await response.json();

                if (result.success) {
                    this.messages.push({
                        id: Date.now(),
                        role: 'assistant',
                        content: '✓ ' + result.message
                    });
                    this.notify('success', 'Transaction saved!');
                    this.pendingTransactions = this.pendingTransactions.filter(p => p.data.id !== txnId);
                } else {
                    this.notify('error', result.message || 'Failed to save transaction');
                }
            } catch (error) {
                console.error('Confirm error:', error);
                this.notify('error', 'Failed to confirm transaction');
            } finally {
                this.confirming = false;
            }
        },

        cancelTransaction(txnId) {
            fetch('/api/chat/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction_id: txnId })
            }).catch(() => {});

            this.pendingTransactions = this.pendingTransactions.filter(p => p.data.id !== txnId);
        },

        async confirmAllTransactions() {
            if (this.pendingTransactions.length === 0 || this.confirming) return;

            this.confirming = true;

            try {
                const response = await fetch('/api/chat/confirm-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ thread_id: this.currentThreadId })
                });

                const result = await response.json();

                if (result.success) {
                    this.messages.push({
                        id: Date.now(),
                        role: 'assistant',
                        content: `✓ ${result.message}`
                    });
                    this.notify('success', result.message);
                    this.pendingTransactions = [];
                } else {
                    this.notify('error', result.message || 'Failed to confirm transactions');
                }
            } catch (error) {
                console.error('Confirm all error:', error);
                this.notify('error', 'Failed to confirm transactions');
            } finally {
                this.confirming = false;
            }
        },

        async cancelAllTransactions() {
            if (this.pendingTransactions.length === 0) return;

            try {
                await fetch('/api/chat/cancel-all', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ thread_id: this.currentThreadId })
                });

                this.pendingTransactions = [];
                this.notify('info', 'All pending transactions cancelled');
            } catch (error) {
                console.error('Cancel all error:', error);
            }
        },

        async loadPending() {
            try {
                const url = this.currentThreadId 
                    ? `/api/chat/pending?thread_id=${this.currentThreadId}`
                    : '/api/chat/pending';
                const response = await fetch(url);
                const pending = await response.json();
                this.pendingTransactions = pending.map(p => ({
                    type: 'preview',
                    content: p.preview,
                    data: {
                        id: p.id,
                        transaction: p.transaction
                    }
                }));
            } catch (error) {
                console.error('Failed to load pending:', error);
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
                    this.uploadedFilePath = result.file_path;
                    this.input = `Import transactions from the uploaded file: ${result.filename}`;
                    await this.sendMessage();
                    this.uploadedFilePath = null;
                } else {
                    this.notify('error', result.error || 'Upload failed');
                }
            } catch (error) {
                console.error('Upload error:', error);
                this.notify('error', 'Failed to upload file');
            } finally {
                this.uploading = false;
                event.target.value = '';
            }
        },

        debounce(key, fn, delay = 500) {
            if (this._debounceTimers[key]) {
                clearTimeout(this._debounceTimers[key]);
            }
            this._debounceTimers[key] = setTimeout(fn, delay);
        },

        async updatePending(txnId, field, value) {
            this.debounce(`update-${txnId}`, async () => {
                try {
                    const response = await fetch('/api/chat/update-pending', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            transaction_id: txnId,
                            updates: { [field]: value }
                        })
                    });

                    const result = await response.json();

                    if (result.success) {
                        const pending = this.pendingTransactions.find(p => p.data.id === txnId);
                        if (pending) {
                            pending.content = result.preview;
                        }
                    }
                } catch (error) {
                    console.error('Update pending error:', error);
                }
            }, 300);
        },

        async loadTransactions() {
            try {
                const response = await fetch('/api/ledger/transactions?limit=100');
                const data = await response.json();
                this.transactions = data.transactions || [];
                this.filterTransactions();
            } catch (error) {
                console.error('Failed to load transactions:', error);
                this.notify('error', 'Failed to load transactions');
            }
        },

        async loadTransactionStats() {
            try {
                const response = await fetch(`/api/ledger/stats?period=${this.txnPeriod}`);
                this.txnStats = await response.json();
            } catch (error) {
                console.error('Failed to load stats:', error);
            }
        },

        filterTransactions() {
            let filtered = [...this.transactions];
            
            if (this.txnSearch) {
                const search = this.txnSearch.toLowerCase();
                filtered = filtered.filter(t => 
                    t.payee.toLowerCase().includes(search) ||
                    t.accounts.some(a => a.toLowerCase().includes(search)) ||
                    (t.note && t.note.toLowerCase().includes(search))
                );
            }
            
            if (this.txnCategoryFilter) {
                filtered = filtered.filter(t => 
                    t.accounts.some(a => a.includes(this.txnCategoryFilter))
                );
            }
            
            this.filteredTransactions = filtered;
            this.groupTransactionsByDate();
        },

        groupTransactionsByDate() {
            const groups = {};
            for (const txn of this.filteredTransactions) {
                if (!groups[txn.date]) groups[txn.date] = [];
                groups[txn.date].push(txn);
            }
            this.groupedTransactions = groups;
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
            // Using DaisyUI-compatible color classes that work in both light and dark mode
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

        async loadLedgerFile() {
            try {
                const params = new URLSearchParams();
                if (this.ledgerSearch) params.set('search', this.ledgerSearch);
                
                const response = await fetch(`/api/ledger/file?${params}`);
                const data = await response.json();
                
                this.ledgerContent = data.content || '';
                this.ledgerPath = data.path || '';
                this.ledgerLines = data.lines || 0;
                this.ledgerExists = data.exists !== false;
            } catch (error) {
                console.error('Failed to load ledger file:', error);
                this.notify('error', 'Failed to load ledger file');
            }
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

            // Check for transaction confirmation pattern and format nicely
            const txnPattern = /^[^\n]*(?:Blinkit|Uber|Swiggy|Zomato|Amazon|Netflix|Spotify)[^\n]*\n.*?(?:Expenses|Assets|Liabilities).*?\n\n?(?:```ledger\n[\s\S]*?```)?/i;

            // Format ledger code blocks beautifully
            text = text.replace(/```ledger\n([\s\S]*?)```/g, (match, code) => {
                const highlighted = this.highlightLedger(code.trim());
                return `<div class="ledger-block mt-3"><pre class="text-[13px] leading-relaxed">${highlighted}</pre></div>`;
            });

            // Format generic code blocks
            text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<div class="ledger-block mt-3"><pre class="text-[13px] leading-relaxed">${this.escapeHtml(code.trim())}</pre></div>`;
            });

            // Format transaction summary nicely (the checkmark response)
            text = text.replace(/^(.*?)\n(.*?(?:Expenses|Income|Assets|Liabilities)[^\n]*)\s*(?:\n|$)/gm, (match, line1, line2) => {
                // Check if this looks like a transaction summary
                if (line1.includes('₹') || line1.includes('INR') || /\d+(?:\.\d+)?/.test(line1)) {
                    return `<div class="transaction-summary py-2">
                        <div class="font-medium text-base-content">${line1}</div>
                        <div class="text-sm text-base-content/60 mt-1">${line2}</div>
                    </div>`;
                }
                return match;
            });

            // Standard markdown formatting
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

        // Highlight ledger syntax
        highlightLedger(text) {
            if (!text) return '';
            return text
                // Date
                .replace(/^(\d{4}\/\d{2}\/\d{2})/gm, '<span class="ledger-date">$1</span>')
                // Status + Payee (rest of first line after date)
                .replace(/(<span class="ledger-date">.*?<\/span>)\s*([*!]?\s*)(.+)$/gm,
                    '$1 $2<span class="ledger-payee">$3</span>')
                // Comments
                .replace(/^(\s*;.*)$/gm, '<span class="ledger-comment">$1</span>')
                // Account names
                .replace(/^(\s+)([A-Z][a-zA-Z:]+)/gm, '$1<span class="ledger-account">$2</span>')
                // Amounts
                .replace(/(-?[\d,_.]+)\s+([A-Z]{3})/g, '<span class="ledger-amount">$1 $2</span>');
        },

        // Format currency
        formatCurrency(amount, currency = 'INR') {
            const formatter = new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            });
            return formatter.format(amount);
        },

        scrollToBottom() {
            this.$nextTick(() => {
                const container = this.$refs.messagesContainer;
                if (container) {
                    container.scrollTo({
                        top: container.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            });
        },

        // Show notification
        notify(type, message) {
            window.dispatchEvent(new CustomEvent('notify', {
                detail: {
                    id: Date.now(),
                    type: type,
                    message: message
                }
            }));
        }
    };
}
