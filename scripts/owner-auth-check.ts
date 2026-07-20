/**
 * Gate for the owner-auth primitives (Codex R3-P1). Pure crypto — no network,
 * no request context — so it can assert the session cookie's guarantees:
 * mint→verify roundtrips, a tampered signature is rejected, an expired session
 * is rejected, a session signed under a different owner token is rejected, the
 * passphrase check is exact, and everything fails closed when unconfigured.
 *
 * Run: npx tsx scripts/owner-auth-check.ts
 */
process.env.REEF_OWNER_TOKEN = "test-owner-passphrase";
delete process.env.REEF_OWNER_SECRET;

async function main() {
const {
  mintSession, verifySessionValue, checkOwnerToken, ownerAuthConfigured,
} = await import("../src/lib/owner-auth");

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean) => results.push({ name, ok });

const now = 1_800_000_000_000; // fixed instant (no Date.now — deterministic)
const value = mintSession(now)!;

check("configured when token set", ownerAuthConfigured() === true);
check("passphrase exact match", checkOwnerToken("test-owner-passphrase") === true);
check("passphrase wrong rejected", checkOwnerToken("nope") === false);
check("passphrase empty rejected", checkOwnerToken("") === false);
check("mint→verify roundtrip", verifySessionValue(value, now)?.operator === "owner");

// tamper the trailing HMAC → reject
const tampered = value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
check("tampered signature rejected", verifySessionValue(tampered, now) === null);

// expired (31 days later, TTL is 30) → reject
check("expired session rejected", verifySessionValue(value, now + 31 * 24 * 3600 * 1000) === null);

// a value signed under a different owner token must not verify
process.env.REEF_OWNER_TOKEN = "a-different-passphrase";
check("wrong-key session rejected", verifySessionValue(value, now) === null);

// unconfigured → fail closed everywhere
process.env.REEF_OWNER_TOKEN = "";
check("unconfigured: not configured", ownerAuthConfigured() === false);
check("unconfigured: mint null", mintSession(now) === null);
check("unconfigured: verify null", verifySessionValue(value, now) === null);
check("unconfigured: passphrase false", checkOwnerToken("anything") === false);

let failures = 0;
for (const r of results) {
  console.log(`${r.ok ? "✓ pass" : "✗ FAIL"}  ${r.name}`);
  if (!r.ok) failures++;
}
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} — ${results.length} checks`);
process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
