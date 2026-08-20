// Per-hint breakdown of the BUILT remote server, in the same shape as the live probe,
// so the R2 before/after is one comparison rather than two differently-shaped claims.
import { buildServer } from "../../dist/index.js";
const s = await buildServer({ remote: true });
const t = (await s.server._requestHandlers.get("tools/list")({ method:"tools/list", params:{} }, {})).tools;
const H = ["readOnlyHint","destructiveHint","idempotentHint","openWorldHint"];
const miss = {}; for (const h of H) miss[h] = t.filter(x => typeof (x.annotations||{})[h] !== "boolean").length;
console.log("BUILT tools=" + t.length);
console.log("missing-per-hint:", JSON.stringify(miss));
console.log("titles-missing:", t.filter(x => !(x.annotations||{}).title).length);
