import { build } from "esbuild";
import { readFileSync } from "fs";

const [entry, outfile, ...pkgPaths] = process.argv.slice(2);

const external = [
  ...new Set(
    pkgPaths.flatMap((p) =>
      Object.keys(JSON.parse(readFileSync(p, "utf8")).dependencies || {})
    )
  ),
].filter((d) => !d.startsWith("@archmax/"));

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  external,
});
