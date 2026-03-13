import { test, expect } from '@playwright/test';
import { nip19 } from 'nostr-tools';

test('key rotation demo: send request + collect 2 guardian partials (no relays)', async ({ page }) => {
  // Deterministic UUIDs. Next dev may call crypto.randomUUID elsewhere, so we only assert
  // the final nonce/req_id are within this set and remain stable.
  await page.addInitScript(() => {
    const vals = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ];
    let i = 0;
    (globalThis as any).crypto.randomUUID = () => vals[Math.min(i++, vals.length - 1)];
    try {
      localStorage.clear();
    } catch {
      // ignore
    }
  });

  await page.goto('/key-rotation-demo');

  // Wait for the E2E hook exposed by ReduxProvider (enabled by NEXT_PUBLIC_E2E=1).
  await page.waitForFunction(() => Boolean((window as any).__friendpubTest?.seedRotationAttestations));

  // Seed logged-in user so "New npub" is non-empty.
  const userPubHex = '0000000000000000000000000000000000000000000000000000000000000001';
  const newNpub = nip19.npubEncode(userPubHex);
  await page.evaluate((pub) => (window as any).__friendpubTest.setUserPubkeyHex(pub), userPubHex);
  await expect(page.getByPlaceholder('New npub (current account)')).toHaveValue(newNpub);

  // Stub DM send + relay preflight (no network).
  await page.evaluate(() => {
    const w = window as any;
    if (!w.__friendpubTest) w.__friendpubTest = {};
    w.__friendpubTest.dm = {
      preflightDMRelayConnection: async () => 1,
      sendMessage: async () => true,
    };
  });

  const oldNpub = nip19.npubEncode(
    '00000000000000000000000000000000000000000000000000000000000000aa',
  );
  const g1PubHex = '0000000000000000000000000000000000000000000000000000000000000002';
  const g2PubHex = '0000000000000000000000000000000000000000000000000000000000000003';
  const g1Npub = nip19.npubEncode(g1PubHex);
  const g2Npub = nip19.npubEncode(g2PubHex);

  const oldInput = page.getByPlaceholder('Old npub (required)');
  await oldInput.fill(oldNpub);
  await expect(oldInput).toHaveValue(oldNpub);

  // Fill only 2 guardians + secrets; leave remaining rows blank.
  await page.getByPlaceholder('Guardian 1 npub').first().fill(g1Npub);
  await page.getByPlaceholder('Guardian 2 npub').first().fill(g2Npub);
  await page.getByPlaceholder('Guardian 1 secret').fill('guardian-secret-1');
  await page.getByPlaceholder('Guardian 2 secret').fill('guardian-secret-2');

  // Derive group_id (should appear once npubs are valid)
  const groupIdInput = page.getByLabel('Computed group_id');
  await expect(groupIdInput).toHaveValue(/.+/);
  const group_id = await groupIdInput.inputValue();

  // In next dev, a devtools portal can overlay the page; use force click.
  await page.getByRole('button', { name: 'Send rotation request via DM' }).click({ force: true });

  const nonceInput = page.getByPlaceholder('Nonce (auto-generated on send)');
  const reqIdInput = page.getByPlaceholder('Request id (auto-generated on send)');

  const nonce = await nonceInput.inputValue();
  const req_id = await reqIdInput.inputValue();

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  expect(nonce).toMatch(uuidRe);
  expect(req_id).toMatch(uuidRe);

  // Inject 2 rotation-attestation messages into local redux state.
  // parseRotationAttestationV2 only checks presence of fields, not cryptographic validity.
  const a1 = {
    type: 'rotation-attestation',
    version: 2,
    req_id,
    group_id,
    guardian_id: 1,
    old_npub: oldNpub,
    new_npub: newNpub,
    nonce,
    partial: { id: 1, R_i: 'aa', z_i: 'bb' },
  };
  const a2 = {
    type: 'rotation-attestation',
    version: 2,
    req_id,
    group_id,
    guardian_id: 2,
    old_npub: oldNpub,
    new_npub: newNpub,
    nonce,
    partial: { id: 2, R_i: 'cc', z_i: 'dd' },
  };

  await page.evaluate(
    ({ g1Npub, g2Npub, a1, a2 }) => {
      const w = window as any;
      w.__friendpubTest.seedRotationAttestations([
        { from_npub: g1Npub, created_at: 1700000001, raw: JSON.stringify(a1) },
        { from_npub: g2Npub, created_at: 1700000002, raw: JSON.stringify(a2) },
      ]);
    },
    { g1Npub, g2Npub, a1, a2 },
  );

  await page.getByRole('button', { name: 'Collect matching partials' }).click({ force: true });

  await expect(page.getByText(/from 2 unique guardian\(s\)/)).toBeVisible();

  // Ensure nonce/req_id remain stable after collecting.
  await expect(nonceInput).toHaveValue(nonce);
  await expect(reqIdInput).toHaveValue(req_id);

  // Assert the JSON in "Collected partials" has 2 unique guardians and includes both ids.
  const partialsPre = page
    .getByRole('heading', { name: 'Collected partials' })
    .locator('xpath=following-sibling::pre[1]');

  const partialsRaw = await partialsPre.textContent();
  expect(partialsRaw).toBeTruthy();

  const partials = JSON.parse(partialsRaw || '[]');
  expect(partials).toHaveLength(2);

  const ids = partials.map((r: any) => r?.partial?.id).sort();
  expect(ids).toEqual([1, 2]);

  const froms = Array.from(new Set(partials.map((r: any) => r?.from))).filter(Boolean);
  expect(froms.length).toBe(2);
});
