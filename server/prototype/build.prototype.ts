// PROTOTYPE: inlines plan-outing.js and snapshot.json into the template -> plan-outing.prototype.html
import { readFileSync, writeFileSync } from "node:fs";
const d = import.meta.dir;
const tpl = readFileSync(`${d}/plan-outing.template.prototype.html`, "utf8");
const snap = readFileSync(`${d}/snapshot.json`, "utf8").replace(/<\//g, "<\\/");
const mod = readFileSync(`${d}/plan-outing.js`, "utf8").replace(/<\/script/gi, "<\\/script");
writeFileSync(`${d}/plan-outing.prototype.html`, tpl.split("/*SNAPSHOT*/").join(snap).split("/*MODULE*/").join(mod));
