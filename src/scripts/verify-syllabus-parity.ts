/**
 * Verifies the DB-backed syllabusService returns exactly what the previous hardcoded
 * implementation returned. Compares /app/syllabus, /app/syllabus/:batch and
 * /app/syllabus/:batch/:dept payloads against the dataset recovered from git.
 *
 *   npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/verify-syllabus-parity.ts
 */
import { execSync } from "child_process";
import { syllabusService } from "services/app/syllabus.service";

const SERVICE = "src/services/app/syllabus.service.ts";

/**
 * Walks back through the file's history for the newest revision that still holds the
 * hardcoded arrays. Reading HEAD only worked while the DB rewrite was uncommitted — once it
 * landed, HEAD became the new implementation and there was nothing left to compare against.
 */
function legacyRef(): string {
  const revs = execSync(`git rev-list HEAD -- ${SERVICE}`, { maxBuffer: 8 * 1024 * 1024 })
    .toString().trim().split(/\r?\n/).filter(Boolean);
  for (const rev of revs) {
    const src = execSync(`git show ${rev}:${SERVICE}`, { maxBuffer: 8 * 1024 * 1024 }).toString();
    if (src.includes("const batch45Depts")) return rev;
  }
  throw new Error(`no revision of ${SERVICE} still contains the hardcoded dataset`);
}

function loadLegacy() {
  const ref = legacyRef();
  console.log(`comparing against the hardcoded dataset at ${ref.slice(0, 8)}`);
  const src = execSync(`git show ${ref}:${SERVICE}`, { maxBuffer: 8 * 1024 * 1024 }).toString();
  const grab = (name: string) => {
    const i = src.indexOf(`const ${name}`);
    const start = src.indexOf("=", i) + 1;
    const openIdx = src.slice(start).search(/[[{]/) + start;
    const open = src[openIdx];
    const close = open === "[" ? "]" : "}";
    let depth = 0;
    let end = openIdx;
    for (let j = openIdx; j < src.length; j++) {
      if (src[j] === open) depth++;
      else if (src[j] === close) { depth--; if (depth === 0) { end = j; break; } }
    }
    return new Function(`return (${src.slice(openIdx, end + 1)});`)();
  };
  return { batches: grab("batches"), d45: grab("batch45Depts"), d46: grab("batch46Depts"), topics: grab("deptTopics") };
}

const norm = (v: unknown) => JSON.stringify(v);

(async () => {
  const legacy = loadLegacy();
  let pass = 0;
  const fails: string[] = [];
  const check = (label: string, got: unknown, want: unknown) => {
    if (norm(got) === norm(want)) { pass++; return; }
    fails.push(`${label}\n     got:  ${norm(got)}\n     want: ${norm(want)}`);
  };

  check("GET /app/syllabus", await syllabusService.getBatches(), legacy.batches);
  check("GET /app/syllabus/45", await syllabusService.getDepts("45"), legacy.d45);
  check("GET /app/syllabus/46", await syllabusService.getDepts("46"), legacy.d46);
  check("GET /app/syllabus/99 (unknown)", await syllabusService.getDepts("99"), null);

  for (const batch of Object.keys(legacy.topics)) {
    for (const dept of Object.keys(legacy.topics[batch])) {
      const list = legacy.topics[batch][dept];
      const want = batch === "46" && dept === "all" && list.length === 1 ? list[0] : list;
      check(`GET /app/syllabus/${batch}/${dept}`, await syllabusService.getTopics(batch, dept), want);
    }
  }
  check("GET /app/syllabus/45/nope (unknown)", await syllabusService.getTopics("45", "nope"), null);

  console.log(`\npassed: ${pass} · failed: ${fails.length}`);
  for (const f of fails) console.log("  FAIL " + f);
  process.exit(fails.length ? 1 : 0);
})();
