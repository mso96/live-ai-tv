import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { transformSync } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/components/Horoscopes.tsx", import.meta.url), "utf8");

test("horoscopes: twelve signs, alternate readings, reset and accessible controls", () => {
  // Exercise component event handlers with a small, isolated hook-state harness.
  const state = [];
  let cursor = 0;
  const module = { exports: {} };
  const code = transformSync(source, { loader: "tsx", jsx: "automatic", format: "cjs" }).code;
  runInNewContext(code, {
    module, exports: module.exports,
    require: name => name === "react" ? {
      ...require("react"),
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
    } : require(name),
  });
  const render = () => { cursor = 0; return module.exports.default(); };
  const find = (node, type) => {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node;
    return [node.props?.children].flat(Infinity).map(child => find(child, type)).find(Boolean);
  };
  const initial = renderToStaticMarkup(render());
  assert.equal((initial.match(/<option /g) || []).length, 12);
  assert.match(initial, /aria-live="polite"/);
  assert.match(initial, /for="star-sign"/);
  for (let index = 0; index < 12; index++) {
    find(render(), "select").props.onChange({ target: { value: String(index) } });
    const first = renderToStaticMarkup(render());
    assert.ok(!first.includes("undefined"));
    find(render(), "button").props.onClick();
    const second = renderToStaticMarkup(render());
    assert.notEqual(second, first);
    find(render(), "button").props.onClick();
    assert.equal(renderToStaticMarkup(render()), first);
    find(render(), "button").props.onClick();
    find(render(), "select").props.onChange({ target: { value: String(index) } });
    assert.equal(renderToStaticMarkup(render()), first);
  }
});
