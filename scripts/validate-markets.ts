/**
 * Validates data/markets.json and data/people.json.
 * Exit code 1 on any problem. Run: npm run markets:validate
 */
import fs from "node:fs";
import { MarketsFileSchema, PeopleFileSchema } from "../src/lib/content";

const marketsRaw = JSON.parse(fs.readFileSync("data/markets.json", "utf8"));
const peopleRaw = JSON.parse(fs.readFileSync("data/people.json", "utf8"));

const people = PeopleFileSchema.safeParse(peopleRaw);
if (!people.success) {
  console.error("data/people.json is invalid:\n", JSON.stringify(people.error.issues, null, 2));
  process.exit(1);
}
const peopleIds = new Set(people.data.people.map((p) => p.id));

const file = MarketsFileSchema.safeParse(marketsRaw);
if (!file.success) {
  console.error("data/markets.json is invalid:\n", JSON.stringify(file.error.issues, null, 2));
  process.exit(1);
}

let problems = 0;
const now = Date.now();
for (const m of file.data.markets) {
  for (const id of m.people) {
    if (!peopleIds.has(id)) {
      console.error(`market ${m.slug}: unknown person id "${id}" (add it to data/people.json)`);
      problems++;
    }
  }
  if (m.status === "open" && new Date(m.closesAt).getTime() < now - 14 * 86_400_000) {
    console.warn(`warning: market ${m.slug} closed more than 14 days ago but is still "open" — resolve it`);
  }
  if (!/[֐-׿]/.test(m.title)) {
    console.error(`market ${m.slug}: title must be in Hebrew`);
    problems++;
  }
}
if (problems) process.exit(1);

const open = file.data.markets.filter((m) => m.status === "open").length;
const resolved = file.data.markets.length - open;
console.log(`OK: ${file.data.markets.length} markets (${open} open, ${resolved} resolved/cancelled), ${peopleIds.size} people`);
