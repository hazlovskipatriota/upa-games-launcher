import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

await fs.rm(path.join(root, "games"), { recursive: true, force: true });
await fs.rm(path.join(root, "temp"), { recursive: true, force: true });
await fs.rm(path.join(root, "installed-games.json"), { force: true });

await fs.mkdir(path.join(root, "games"), { recursive: true });
await fs.mkdir(path.join(root, "temp"), { recursive: true });

console.log("Wyczyszczono foldery games, temp oraz plik installed-games.json.");
