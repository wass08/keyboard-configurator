import { webkit } from 'playwright';
import assert from 'node:assert/strict';

// Reduced from the emitted Leva/@stitches chunk. Real WebKit must exercise
// built assets too: Chromium accepts all three forms and cannot catch this.
export async function syntaxEvidence() {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage();
    const snippets = {
      joined: 'for(var k=()=>{return i in e?0:1};;){}',
      parenthesized: 'for(var k=()=>{return (i in e)?0:1};;){}',
      separate: 'var k=()=>{return i in e?0:1};for(;;){}',
    };
    const result = {};
    for (const [name, code] of Object.entries(snippets)) result[name] = await page.evaluate(code => {
      try { new Function(code); return 'parses'; } catch (error) { return String(error); }
    }, code);
    assert.equal(result.parenthesized, 'parses'); assert.equal(result.separate, 'parses');
    return result;
  } finally { await browser.close(); }
}
if (process.argv[1]?.endsWith('/mobile-syntax-check.mjs')) console.log(await syntaxEvidence());
