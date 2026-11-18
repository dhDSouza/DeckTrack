const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    { ignores: ["node_modules/**", "dist/**", ".cache/**", "data/**"] },
    {
        files: ["public/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "script",
            globals: {
                ...globals.browser,
                $: "readonly",
                state: "readonly",
                formats: "readonly",
                escapeHtml: "readonly",
                api: "readonly",
                notify: "readonly",
                modal: "readonly",
                bindForm: "readonly",
                load: "readonly",
                render: "readonly",
                navigate: "readonly",
                create: "readonly",
                openDeck: "readonly",
                openDeckEditor: "readonly",
                openListImport: "readonly",
                CardFilterUI: "readonly",
                CardImageUI: "readonly",
                DeckPage: "readonly",
                DeckStats: "readonly",
                TrackingUI: "readonly",
                ArcaneUI: "readonly"
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-redeclare": ["error", { builtinGlobals: false }],
            "no-unused-vars": ["error", { vars: "local", args: "none", caughtErrors: "none" }],
            "no-empty": ["error", { allowEmptyCatch: true }]
        }
    }
];
