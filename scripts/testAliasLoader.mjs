import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { pathToFileURL } from "node:url"

const engineRequire = createRequire(
  new URL("../src/map/engines/cesium/package.json", import.meta.url),
)
const cesiumPackageRoot = dirname(engineRequire.resolve("cesium/package.json"))

const compiledRoots = new Map([
  ["@/", new URL("../dist-test/src/", import.meta.url)],
  ["@tests/", new URL("../dist-test/tests/", import.meta.url)],
])

const exactAliases = new Map([
  [
    "@cesium-base/map-engine-entry",
    new URL("../dist-test/tests/mapEngineEntryStub.js", import.meta.url),
  ],
  ["cesium", pathToFileURL(join(cesiumPackageRoot, "Source/Cesium.js"))],
])

function candidatesFor(target) {
  return [
    target.endsWith(".ts") ? `${target.slice(0, -3)}.js` : null,
    target,
    `${target}.js`,
    `${target}.mjs`,
    `${target}/index.js`,
    `${target}/index.mjs`,
  ].filter(Boolean)
}

export async function resolve(specifier, context, nextResolve) {
  const exactAlias = exactAliases.get(specifier)
  if (exactAlias) {
    return nextResolve(exactAlias.href, context)
  }

  const compiledRoot = [...compiledRoots].find(([prefix]) => specifier.startsWith(prefix))

  if (!compiledRoot) {
    return nextResolve(specifier, context)
  }

  const [prefix, root] = compiledRoot
  let lastError
  for (const candidate of candidatesFor(specifier.slice(prefix.length))) {
    try {
      return await nextResolve(new URL(candidate, root).href, context)
    } catch (error) {
      lastError ??= error
    }
  }

  throw lastError
}
