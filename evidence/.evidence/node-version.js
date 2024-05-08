const requiredVersion = 18;
const currentVersion = parseInt(process.version.slice(1).split('.')[0]);

if (currentVersion < requiredVersion) {
    const red = '\x1b[31m'; // ANSI escape code for red
    const reset = '\x1b[0m'; // ANSI escape code to reset color
    console.error(red + `Evidence requires Node.js v${requiredVersion} or higher. Please update or install the LTS version of Node.js from https://nodejs.org/` + reset);
    process.exit(1);
}
