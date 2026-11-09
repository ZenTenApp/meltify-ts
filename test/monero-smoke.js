import { buildMoneroReport, renderMoneroText } from './dist/index.js';
   const seed = Uint8Array.from({ length: 32 }, (_, i) => i); // 00..1f
   const report = buildMoneroReport({ seed });
   process.stdout.write(renderMoneroText(report)); // no console.log: it adds a line
   console.log(report.monero.subaddresses.length, report.cake.primary);
