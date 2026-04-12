import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const DEFAULT_SOURCE_DIR = path.resolve(rootDir, "..", "postflop-solver", "artifacts", "f-e-s-h");
const DEFAULT_DEST_DIR = path.join(rootDir, "public", "data", "solver");

function parseArgs(argv){
  const options = {
    source: null,
    destination: null,
    dryRun: false,
    help: false,
  };
  const positional = [];

  for(let i = 0; i < argv.length; i += 1){
    const arg = argv[i];

    if(arg === "--source" || arg === "--from"){
      options.source = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if(arg.startsWith("--source=")){
      options.source = arg.slice("--source=".length);
      continue;
    }

    if(arg.startsWith("--from=")){
      options.source = arg.slice("--from=".length);
      continue;
    }

    if(arg === "--destination" || arg === "--to"){
      options.destination = argv[i + 1] ?? "";
      i += 1;
      continue;
    }

    if(arg.startsWith("--destination=")){
      options.destination = arg.slice("--destination=".length);
      continue;
    }

    if(arg.startsWith("--to=")){
      options.destination = arg.slice("--to=".length);
      continue;
    }

    if(arg === "--dry-run"){
      options.dryRun = true;
      continue;
    }

    if(arg === "--help" || arg === "-h"){
      options.help = true;
      continue;
    }

    if(arg.startsWith("-")){
      throw new Error(`Unknown argument: ${arg}`);
    }

    positional.push(arg);
  }

  if(positional.length > 2){
    throw new Error("Too many positional arguments. Expected [source] [destination].");
  }

  if(!options.source && positional[0]) options.source = positional[0];
  if(!options.destination && positional[1]) options.destination = positional[1];

  return options;
}

function resolveDir(input, fallback){
  if(typeof input !== "string" || input.trim().length === 0){
    return fallback;
  }

  return path.isAbsolute(input) ? path.normalize(input) : path.resolve(rootDir, input);
}

function normalizeRelativeFile(filePath){
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function resolveSafeChild(baseDir, relativeFile, label){
  if(typeof relativeFile !== "string" || relativeFile.trim().length === 0){
    throw new Error(`${label} must be a non-empty string`);
  }

  const resolved = path.resolve(baseDir, relativeFile);
  const relative = path.relative(baseDir, resolved);

  if(relative.startsWith("..") || path.isAbsolute(relative)){
    throw new Error(`${label} escapes base directory: ${relativeFile}`);
  }

  return resolved;
}

async function readJson(filePath, label){
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON for ${label}: ${filePath}`);
  }
}

async function collectJsonFiles(baseDir){
  const results = [];

  async function walk(currentDir){
    let items;
    try {
      items = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for(const item of items){
      const absolutePath = path.join(currentDir, item.name);
      if(item.isDirectory()){
        await walk(absolutePath);
        continue;
      }

      if(item.isFile() && item.name.toLowerCase().endsWith(".json")){
        results.push(path.relative(baseDir, absolutePath));
      }
    }
  }

  await walk(baseDir);
  return results;
}

function printUsage(){
  console.log("Import solver artifacts into public/data/solver");
  console.log("");
  console.log("Usage:");
  console.log("  node scripts/import-solver-artifacts.mjs [--source <dir>] [--destination <dir>] [--dry-run]");
  console.log("  node scripts/import-solver-artifacts.mjs [source] [destination] [--dry-run]");
  console.log("");
  console.log("Defaults:");
  console.log(`  --source      ${DEFAULT_SOURCE_DIR}`);
  console.log(`  --destination ${DEFAULT_DEST_DIR}`);
}

async function main(){
  const options = parseArgs(process.argv.slice(2));
  if(options.help){
    printUsage();
    return;
  }

  const sourceDir = resolveDir(options.source, DEFAULT_SOURCE_DIR);
  const destDir = resolveDir(options.destination, DEFAULT_DEST_DIR);

  const manifestPath = resolveSafeChild(sourceDir, "manifest.json", "manifest path");
  const manifest = await readJson(manifestPath, "manifest");

  if(typeof manifest?.indexFile !== "string" || manifest.indexFile.length === 0){
    throw new Error("manifest.indexFile must be a non-empty string");
  }

  const indexFile = normalizeRelativeFile(manifest.indexFile);
  const indexPath = resolveSafeChild(sourceDir, indexFile, "index path");
  const index = await readJson(indexPath, "index");

  if(!index || typeof index !== "object" || Array.isArray(index)){
    throw new Error("index must be an object");
  }

  if(!index.entries || typeof index.entries !== "object" || Array.isArray(index.entries)){
    throw new Error("index.entries must be an object");
  }

  const filesToCopy = new Set(["manifest.json", indexFile]);

  for(const [spotKey, descriptor] of Object.entries(index.entries)){
    const file = descriptor?.file;
    if(typeof file !== "string" || file.length === 0){
      throw new Error(`index entry ${spotKey} missing descriptor.file`);
    }

    filesToCopy.add(normalizeRelativeFile(file));
  }

  for(const relativeFile of filesToCopy){
    const filePath = resolveSafeChild(sourceDir, relativeFile, "artifact file path");
    await readJson(filePath, `artifact file ${relativeFile}`);
  }

  const expectedFiles = [...filesToCopy].sort();
  const existingJsonFiles = await collectJsonFiles(destDir);
  const staleFiles = existingJsonFiles.filter((file) => !filesToCopy.has(normalizeRelativeFile(file)));

  console.log(`source: ${sourceDir}`);
  console.log(`destination: ${destDir}`);
  console.log(`files referenced by manifest/index: ${expectedFiles.length}`);
  console.log(`stale destination json files: ${staleFiles.length}`);

  if(options.dryRun){
    console.log("dry-run enabled; no files copied");
    for(const file of expectedFiles) console.log(`+ ${file}`);
    for(const file of staleFiles.sort()) console.log(`- ${normalizeRelativeFile(file)}`);
    return;
  }

  for(const relativeFile of expectedFiles){
    const sourcePath = resolveSafeChild(sourceDir, relativeFile, "source artifact path");
    const destPath = resolveSafeChild(destDir, relativeFile, "destination artifact path");

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    if(path.normalize(sourcePath) === path.normalize(destPath)) continue;

    await fs.copyFile(sourcePath, destPath);
  }

  for(const staleRelativeFile of staleFiles){
    const stalePath = resolveSafeChild(destDir, staleRelativeFile, "stale artifact path");
    await fs.rm(stalePath, { force: true });
  }

  console.log(`copied files: ${expectedFiles.length}`);
  if(staleFiles.length > 0){
    console.log(`removed stale files: ${staleFiles.length}`);
  }
  console.log("solver artifact import complete");
}

main().catch((error) => {
  console.error("solver artifact import failed");
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
