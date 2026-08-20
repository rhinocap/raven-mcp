import { buildServer } from "../../dist/index.js";
import { FsTasteStore } from "../../dist/taste-store.js";
const withStore = Object.keys(buildServer({ remote: true, tasteStore: new FsTasteStore() })._registeredTools).sort();
console.log("with tasteStore:", withStore.length);
