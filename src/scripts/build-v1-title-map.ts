/**
 * Scans every v1 flow file on disk and builds a resource-key → title map.
 *
 * Richer than crawling the v1 API: several subjects (econo, om, weaving2,
 * ietex …) exist as flow files that were never wired into v1's router, and the
 * reconciler that seeded v2 read them straight off disk. Those files are the
 * only surviving source for the titles the reconciler dropped.
 *
 * Usage: npx tsx src/scripts/build-v1-title-map.ts <path-to-v1-repo>
 */
import * as fs from "fs";
import * as path from "path";

export function keyOf(url: string): string {
  const u = String(url ?? "").trim();
  let m;
  if ((m = u.match(/drive\.google\.com\/file\/d\/([-\w]{10,})/))) return "f:" + m[1];
  if ((m = u.match(/drive\.google\.com\/(?:drive\/)?(?:u\/\d+\/)?folders\/([-\w]{10,})/)))
    return "d:" + m[1];
  if ((m = u.match(/drive\.google\.com\/open\?id=([-\w]{10,})/))) return "f:" + m[1];
  if ((m = u.match(/docs\.google\.com\/\w+\/d\/([-\w]{10,})/))) return "g:" + m[1];
  if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/playlist\?list=)([-\w]+)/)))
    return "y:" + m[1];
  return u.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

function main() {
  const repo = process.argv[2];
  if (!repo || !fs.existsSync(repo)) {
    console.error("usage: build-v1-title-map.ts <path-to-v1-repo>");
    process.exit(1);
  }
  const flowRoot = path.join(repo, "src/controllers/flows/botReplies");
  if (!fs.existsSync(flowRoot)) {
    console.error(`no flow dir at ${flowRoot}`);
    process.exit(1);
  }

  const files = walk(flowRoot);

  // Two shapes carry a title+link in v1:
  //   webBtnBlockGen("Title", "url")            — grouped buttons on subject pages
  //   textBlockGen(`Title-\n\nurl`)             — leaf topic pages (the bulk of them)
  const BTN =
    /webBtnBlockGen\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3\s*\)/g;
  const TEXT = /textBlockGen\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g;
  // payloadBtnGen("Class Lecture", "econo_classlec_flow") — the only surviving
  // source for what a *topic* button was called, as opposed to a leaf note.
  const PAYLOAD =
    /payloadBtnGen\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3\s*\)/g;
  const GENERIC = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

  const map: Record<string, { title: string; file: string }> = {};
  const payloadMap: Record<string, string> = {};
  let hits = 0;
  let payloadHits = 0;
  let generic = 0;

  /** Trailing separators v1 puts between the label and the link. */
  const cleanTitle = (t: string) =>
    t
      .replace(/\\n/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/[-–—:\s]+$/, "")
      .trim();

  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const rel = path.relative(flowRoot, f).replace(/\\/g, "/");
    const add = (title: string, url: string) => {
      if (!/^https?:\/\//i.test(url) || !title) return;
      const k = keyOf(url);
      hits++;
      // keep the longest title seen — v1 sometimes repeats a link with a stub label
      if (!map[k] || title.length > map[k].title.length) map[k] = { title, file: rel };
    };

    let m: RegExpExecArray | null;
    BTN.lastIndex = 0;
    while ((m = BTN.exec(src))) {
      add(cleanTitle(m[2].replace(/\\(['"`\\])/g, "$1")), m[4].trim());
    }

    TEXT.lastIndex = 0;
    while ((m = TEXT.exec(src))) {
      const body = m[2].replace(/\\(['"`\\])/g, "$1");
      const urlMatch = body.match(/https?:\/\/\S+/);
      if (!urlMatch) continue;
      add(cleanTitle(body.slice(0, urlMatch.index)), urlMatch[0].replace(/[)\s`'"]+$/, ""));
    }

    // Catch-all: many older flows are raw literals — { "text": `Title - <url>` }
    // — with no generator call at all. Any string holding a URL is fair game;
    // this runs as a second pass so the specific patterns above win a conflict.
    GENERIC.lastIndex = 0;
    while ((m = GENERIC.exec(src))) {
      const body = m[2].replace(/\\(['"`\\])/g, "$1");
      const urlMatch = body.match(/https?:\/\/\S+/);
      if (!urlMatch || urlMatch.index === 0) continue;
      const title = cleanTitle(body.slice(0, urlMatch.index));
      const url = urlMatch[0].replace(/[)\s`'"]+$/, "");
      if (!title || !/^https?:\/\//i.test(url)) continue;
      const k = keyOf(url);
      if (map[k]) continue; // never override a specific-pattern title
      generic++;
      map[k] = { title, file: rel };
    }

    PAYLOAD.lastIndex = 0;
    while ((m = PAYLOAD.exec(src))) {
      const title = cleanTitle(m[2].replace(/\\(['"`\\])/g, "$1"));
      const payload = m[4].trim();
      if (!title || !payload) continue;
      payloadHits++;
      // v2 slugs a v1 payload by lowercasing and dropping non-alphanumerics
      const norm = payload.toLowerCase().replace(/[^a-z0-9]/g, "");
      for (const k of [payload, norm, norm.replace(/flow$/, "")]) {
        if (k && (!payloadMap[k] || title.length > payloadMap[k].length)) payloadMap[k] = title;
      }
    }
  }

  fs.writeFileSync("v1-title-map.json", JSON.stringify(map, null, 1));
  fs.writeFileSync("v1-payload-map.json", JSON.stringify(payloadMap, null, 1));
  console.log(`scanned ${files.length} flow files, ${hits} generator links + ${generic} raw-literal links, ${Object.keys(map).length} unique resources`);
  console.log(`${payloadHits} topic buttons -> ${Object.keys(payloadMap).length} payload keys`);
  console.log("wrote v1-title-map.json, v1-payload-map.json");
}

main();
