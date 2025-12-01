import fs from "fs";

function bumpVersion(version) {
  const [major, minor, patch] = version.split(".").map((n) => Number(n));
  return [major, minor, patch + 1].join(".");
}

const manifestPath = "manifest.json";
const pkgPath = "package.json";

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const nextVersion = bumpVersion(manifest.version);
manifest.version = nextVersion;
pkg.version = nextVersion;

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log(`Bumped version to ${nextVersion}`);

