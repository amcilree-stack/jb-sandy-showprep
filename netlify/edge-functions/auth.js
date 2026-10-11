// Site-wide HTTP Basic Auth. Password is NOT stored here, only a salted PBKDF2 hash.
// Preserve this file and the [[edge_functions]] block in netlify.toml.
const USER = "SausageLover";
const SALT = "f95cea62711906e75e72e453cabb509f";
const ITER = 100000;
const HASH = "0c270fe8fc52d445d41f24b2c0f90cd9db9de7ad86f0cf5d05d881a71992e2f1";

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((x) => parseInt(x, 16)));

async function derive(pw) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(SALT), iterations: ITER }, key, 256));
}

function ctEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

const deny = () =>
  new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Sausage", charset="UTF-8"', "Cache-Control": "no-store" },
  });

export default async (request, context) => {
  const h = request.headers.get("authorization") || "";
  if (!h.startsWith("Basic ")) return deny();
  let u, p;
  try {
    const dec = new TextDecoder().decode(Uint8Array.from(atob(h.slice(6).trim()), (c) => c.charCodeAt(0)));
    const i = dec.indexOf(":");
    if (i < 0) return deny();
    u = dec.slice(0, i);
    p = dec.slice(i + 1);
  } catch (e) {
    return deny();
  }
  const got = await derive(p);
  const okPw = ctEqual(got, unhex(HASH));
  const okUser = u === USER;
  if (!(okPw && okUser)) return deny();
  return context.next();
};

export const config = { path: "/*" };
