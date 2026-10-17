import assert from "node:assert/strict";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const baseUrl = new URL(required("BASE_URL"));
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname) ||
  baseUrl.username ||
  baseUrl.password ||
  baseUrl.pathname !== "/" ||
  baseUrl.search ||
  baseUrl.hash
) {
  throw new Error("BASE_URL must be a local origin with no path, query, or credentials");
}

const activeToken = required("ACTIVE_TOKEN");
if (!/^[0-9a-f]{64}$/.test(activeToken)) throw new Error("ACTIVE_TOKEN must be 64 lowercase hexadecimal characters");

const memberCookie = required("MEMBER_COOKIE");
if (/[\r\n]/.test(memberCookie)) throw new Error("MEMBER_COOKIE must be a single-line Cookie header");

const expectedMemberLocation = required("EXPECTED_MEMBER_LOCATION");
if (!/^\/lists\/[0-9a-f-]+$/i.test(expectedMemberLocation)) {
  throw new Error("EXPECTED_MEMBER_LOCATION must be a /lists/<id> path");
}

const invalidToken = "0".repeat(64);
if (invalidToken === activeToken) throw new Error("ACTIVE_TOKEN cannot be the smoke test's invalid token");

async function request(label, token, cookie) {
  try {
    return await fetch(new URL(`/share/${token}`, baseUrl), {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
  } catch {
    throw new Error(`${label}: local request failed; details were redacted`);
  }
}

function assertPrivacyHeaders(response, label) {
  assert.equal(response.headers.get("cache-control"), "private, no-store", `${label}: Cache-Control`);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer", `${label}: Referrer-Policy`);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", `${label}: X-Robots-Tag`);
}

const anonymous = await request("anonymous active link", activeToken);
assert.equal(anonymous.status, 200, "anonymous active link: status");
assertPrivacyHeaders(anonymous, "anonymous active link");
console.log("PASS anonymous active link: 200 with privacy headers");

const invalid = await request("invalid link", invalidToken);
assert.equal(invalid.status, 404, "invalid link: status");
assertPrivacyHeaders(invalid, "invalid link");
if (!(await invalid.text()).includes("This sharing link is unavailable.")) {
  throw new Error("invalid link: generic unavailable response");
}
console.log("PASS invalid link: generic 404 with privacy headers");

const member = await request("existing member", activeToken, memberCookie);
assert.equal(member.status, 302, "existing member: status");
assert.equal(member.headers.get("location"), expectedMemberLocation, "existing member: redirect");
assertPrivacyHeaders(member, "existing member");
console.log("PASS existing member: expected 302 with privacy headers");
