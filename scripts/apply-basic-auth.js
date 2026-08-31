#!/usr/bin/env node
"use strict";

/**
 * BASIC_AUTH_USERS is set in the Netlify dashboard (env vars), not in git.
 * Value shape (Netlify Basic-Auth): space-separated username:password pairs.
 *
 * Confirmed against current Netlify docs (custom HTTP headers / Basic-Auth):
 *   /*
 *     Basic-Auth: <space-separated username:password pairs>
 *
 * If BASIC_AUTH_USERS is unset or empty, skip so deploys still succeed.
 */

const fs = require("fs");
const path = require("path");

const MARKER_START = "# --- begin generated Basic-Auth (do not commit) ---";
const MARKER_END = "# --- end generated Basic-Auth ---";
const headersPath = path.join(__dirname, "..", "_headers");

const users = String(process.env.BASIC_AUTH_USERS || "").trim();

function stripGeneratedBlock(content) {
  const start = content.indexOf(MARKER_START);
  if (start === -1) {
    return content;
  }
  const end = content.indexOf(MARKER_END);
  if (end === -1 || end < start) {
    return content;
  }
  return content.slice(0, start) + content.slice(end + MARKER_END.length);
}

const original = fs.existsSync(headersPath)
  ? fs.readFileSync(headersPath, "utf8")
  : "";
let content = stripGeneratedBlock(original);
if (content && !content.endsWith("\n")) {
  content += "\n";
}

if (!users) {
  if (content !== original && original.includes(MARKER_START)) {
    fs.writeFileSync(headersPath, content);
    console.log(
      "BASIC_AUTH_USERS is unset or empty; removed generated Basic-Auth block."
    );
  } else {
    console.log("BASIC_AUTH_USERS is unset or empty; not adding Basic-Auth.");
  }
  process.exit(0);
}

const block =
  MARKER_START +
  "\n/*\n  Basic-Auth: " +
  users +
  "\n" +
  MARKER_END +
  "\n";

fs.writeFileSync(headersPath, content + block);
console.log("Applied site-wide Basic-Auth from BASIC_AUTH_USERS to _headers.");
