// Explicit engine selection keeps a limited local run distinct from full acceptance.
import {chromium, webkit} from 'playwright';
const engines = {chromium, webkit};
const requested = (process.env.AQARI_BROWSER_ENGINES || 'chromium,webkit').split(',').map(x => x.trim());
if (!requested.length || requested.some(name => !engines[name]) || new Set(requested).size !== requested.length) {
  throw Error('AQARI_BROWSER_ENGINES must select chromium, webkit, or both without duplicates.');
}
export const browserTargets = requested.map(name => [name, engines[name]]);
export async function launchBrowser(type, options = {}) {
  const executablePath = type.name() === 'chromium' ? process.env.AQARI_CHROMIUM_EXECUTABLE : undefined;
  return type.launch({...options, ...(executablePath ? {executablePath} : {})});
}
