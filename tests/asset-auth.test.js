import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyAssetPassword,
  createAssetSessionCookie,
  hasAssetSession
} from "../src/server/asset-auth.js";

process.env.WEBLAB_ASSET_PASSWORD = "test-only-weblab-key";

test("asset password check accepts only the configured secret", () => {
  assert.equal(verifyAssetPassword("test-only-weblab-key"), true);
  assert.equal(verifyAssetPassword("wrong-key"), false);
  assert.equal(verifyAssetPassword(undefined), false);
});

test("signed asset cookie authenticates a Node-style Vercel request", () => {
  const cookie = createAssetSessionCookie().split(";")[0];
  const request = { headers: { cookie } };
  assert.equal(hasAssetSession(request), true);
});

test("unsigned and expired asset cookies are rejected", () => {
  assert.equal(hasAssetSession({ headers: { cookie: "weblab_asset_session=1.invalid" } }), false);
});
