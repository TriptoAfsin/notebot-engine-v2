/**
 * Comprehensive comparison of V1 and V2 compat API responses.
 * Reports any differences found.
 */
const V1 = "http://localhost:6969";
const V2 = "http://localhost:8969";

let total = 0;
let matches = 0;
let diffs = 0;

async function fetchJson(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalize(obj: any): string {
  // Sort keys deterministically for comparison
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function compareArrays(v1: any[], v2: any[], path: string): boolean {
  if (v1.length !== v2.length) {
    console.log(`  DIFF ${path}: count ${v1.length} vs ${v2.length}`);
    return false;
  }
  for (let i = 0; i < v1.length; i++) {
    if (normalize(v1[i]) !== normalize(v2[i])) {
      console.log(`  DIFF ${path}[${i}]:`);
      console.log(`    V1: ${JSON.stringify(v1[i])}`);
      console.log(`    V2: ${JSON.stringify(v2[i])}`);
      return false;
    }
  }
  return true;
}

async function compare(path: string): Promise<boolean> {
  total++;
  const v1 = await fetchJson(V1 + path);
  const v2 = await fetchJson(V2 + path);

  if (v1 === null && v2 === null) {
    matches++;
    return true;
  }
  if (v1 === null || v2 === null) {
    console.log(`  DIFF ${path}: one is null (v1=${!!v1}, v2=${!!v2})`);
    diffs++;
    return false;
  }

  const isArr = Array.isArray(v1);
  let match: boolean;
  if (isArr) {
    match = compareArrays(v1, v2, path);
  } else {
    match = normalize(v1) === normalize(v2);
    if (!match) {
      console.log(`  DIFF ${path}: object mismatch`);
    }
  }

  if (match) {
    matches++;
  } else {
    diffs++;
  }
  return match;
}

async function main() {
  console.log("Comparing V1 and V2 compat APIs...\n");

  // /app/notes
  await compare("/app/notes");

  // /app/labs
  await compare("/app/labs");

  for (const level of ["1", "2", "3", "4"]) {
    console.log(`\nLevel ${level}:`);

    // Subjects
    const ok = await compare(`/app/notes/${level}`);

    // Topics for each route subject
    const v1Subs = await fetchJson(`${V1}/app/notes/${level}`);
    if (v1Subs && Array.isArray(v1Subs)) {
      for (const sub of v1Subs) {
        if (!sub.route) continue;
        const subSlug = sub.route.split("/").pop()!;

        // Topic list
        const topicOk = await compare(`/app/notes/${level}/${subSlug}`);

        // Leaf for each route topic
        const v1Topics = await fetchJson(`${V1}/app/notes/${level}/${subSlug}`);
        if (v1Topics && Array.isArray(v1Topics)) {
          for (const topic of v1Topics) {
            if (!topic.route) continue;
            const topicSlug = topic.route.split("/").pop()!;
            await compare(`/app/notes/${level}/${subSlug}/${topicSlug}`);
          }
        }
      }
    }

    // Lab subjects
    await compare(`/app/labs/${level}`);

    // Lab topics and leaves
    const v1Labs = await fetchJson(`${V1}/app/labs/${level}`);
    if (v1Labs && Array.isArray(v1Labs)) {
      for (const lab of v1Labs) {
        const labSlug = lab.route.split("/").pop()!;
        await compare(`/app/labs/${level}/${labSlug}`);

        // Lab leaves
        const v1LabTopics = await fetchJson(`${V1}/app/labs/${level}/${labSlug}`);
        if (v1LabTopics && Array.isArray(v1LabTopics)) {
          for (const t of v1LabTopics) {
            if (!t.route) continue;
            const topicSlug = t.route.split("/").pop()!;
            await compare(`/app/labs/${level}/${labSlug}/${topicSlug}`);
          }
        }
      }
    }
  }

  console.log(`\n\n========================================`);
  console.log(`Total endpoints compared: ${total}`);
  console.log(`Matches: ${matches}`);
  console.log(`Differences: ${diffs}`);
  console.log(`Match rate: ${((matches / total) * 100).toFixed(1)}%`);
  console.log(`========================================`);
}

main().then(() => process.exit(0));
