// bun server/links.ts add|rotate <name>: issues a personal link (see src/links.ts).
import { linksCommand } from "./src/links";

const r = linksCommand(process.argv.slice(2), process.env);
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
process.exit(r.code);
