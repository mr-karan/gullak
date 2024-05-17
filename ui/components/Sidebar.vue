export default { template: `
<aside class="menu">
            <p class="menu-label">Navigation</p>
            <ul class="menu-list">
                <li><router-link to="/">Home</router-link></li>
                <li><router-link to="/transactions">Transactions</router-link></li>
            </ul>
        </aside>
`, name: 'Sidebar' };
