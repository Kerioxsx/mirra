#!/usr/bin/env node
// Test-only stand-in for the Taobao Open Platform gateway. It answers every request with the
// documented-shape fixture the backend unit tests use, so e2e runs exercise the real Taobao
// connector (signing, parsing, mapping) without credentials. Never used outside tests.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";

const fixture = readFileSync(
  resolve(
    import.meta.dirname,
    "../../backend/tests/fixtures/taobao_ovs_material_item_optional.json",
  ),
);
const port = Number(process.env.PORT ?? 8765);
let calls = 0;

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ calls }));
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const params = new URLSearchParams(body);
    calls++;
    if (params.get("method") !== "taobao.ovs.tbk.material.item.optional" || !params.get("sign")) {
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          error_response: {
            code: 25,
            msg: "Invalid signature",
            sub_code: "isv.invalid-signature",
          },
        }),
      );
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(fixture);
  });
}).listen(port, "127.0.0.1", () => console.log(`mock TOP gateway on :${port}`));
