import { createApp } from "https://unpkg.com/vue@3.2.31/dist/vue.esm-browser.js";
import {
  createRouter,
  createWebHashHistory,
} from "https://unpkg.com/vue-router@4.0.12/dist/vue-router.esm-browser.js";
import Sidebar from "./components/Sidebar.js";
import Home from "./components/Home.js";
import Transactions from "./components/Transactions.js";

const routes = [
  { path: "/", component: Home },
  { path: "/transactions", component: Transactions },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

const App = {
  components: { Sidebar },
  template: `
        <div class="columns">
            <div class="column is-one-fifth">
                <Sidebar />
            </div>
            <div class="column">
                <router-view></router-view>
            </div>
        </div>
    `,
};

createApp(App).use(router).mount("#app");
