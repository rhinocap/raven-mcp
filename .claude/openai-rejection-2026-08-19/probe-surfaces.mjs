// Throwaway: measure the LOCAL remote:true and remote:false tool surfaces in ONE
// process each is impossible -- setRemoteRuntime() is a one-way per-process latch --
// so this script takes a mode from argv and is run twice.
import { buildServer } from "../../dist/index.js";
const remote = process.argv[2] === "remote";
const srv = buildServer({ remote });
const reg = srv._registeredTools || {};
const names = Object.keys(reg).sort();
console.log("mode:", remote ? "remote:true" : "remote:false");
console.log("count:", names.length);
for (const t of ["decision_get", "decision_list", "bind_taste_surface", "create_brand_profile", "raven_register"]) {
  console.log("  present:", t, names.indexOf(t) !== -1);
}
console.log("NAMES:" + names.join(","));
