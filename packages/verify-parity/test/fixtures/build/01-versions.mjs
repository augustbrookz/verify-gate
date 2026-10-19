// List each part's section versions (amendment history).
import { get, versionsUrl, calls } from './ecfr.mjs';
export const PARTS = [['16', '310'], ['16', '429'], ['16', '435'], ['16', '444'], ['29', '825'], ['34', '668'], ['47', '64'], ['12', '1030'], ['7', '273']];
for (const [t, p] of PARTS) {
  const j = JSON.parse(await get(versionsUrl(t, p), `versions/title-${t}-part-${p}.json`));
  const secs = j.content_versions.filter((v) => v.type === 'section');
  const ids = new Set(secs.map((v) => v.identifier));
  const amended = [...ids].filter((id) => secs.filter((v) => v.identifier === id).length > 1);
  console.log(`${t} CFR ${p}: ${secs.length} section versions, ${amended.length} amended sections; sample fields: ${Object.keys(secs[0] ?? {}).join(',')}`);
}
console.log('network calls', calls);
