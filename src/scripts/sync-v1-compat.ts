/**
 * Sync V1 API responses into V2 DB metadata for exact compat layer matching.
 *
 * This script calls the running V1 API, captures every topic-level and leaf-level
 * response, and stores them as metadata on V2 subjects/levels so the compat
 * layer can return the EXACT V1 response format.
 *
 * Prerequisites: V1 running on port 6969, V2 DB accessible.
 */
import dotenv from "dotenv";
dotenv.config();

import { getDb } from "db/index";
import { subjects, levels, notes, topics } from "db/schema";
import { eq, and, asc } from "drizzle-orm";

const V1_BASE = "http://localhost:6969";

async function fetchV1(path: string) {
  const res = await fetch(`${V1_BASE}${path}`);
  if (!res.ok) return null;
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type V1TopicItem = { topic: string; route?: string; url?: string };
type V1LeafItem = { title: string; url: string };

async function syncNoteTopics() {
  const db = getDb();
  console.log("\n=== Syncing note topic metadata from V1 API ===\n");

  // Get all levels
  const allLevels = await db
    .select()
    .from(levels)
    .orderBy(asc(levels.sortOrder));

  for (const level of allLevels) {
    const levelSlug = level.slug;
    console.log(`\nLevel ${levelSlug}:`);

    // Get V1 subject list for this level
    const v1Subjects: Array<{ subName: string; route?: string; url?: string }> =
      await fetchV1(`/app/notes/${levelSlug}`);
    if (!v1Subjects || !Array.isArray(v1Subjects)) {
      console.log(`  No V1 data for level ${levelSlug}`);
      continue;
    }

    // Get all v2 subjects for this level
    const v2Subjects = await db
      .select()
      .from(subjects)
      .where(eq(subjects.levelId, level.id))
      .orderBy(asc(subjects.sortOrder));

    // For each v1 subject that has a route (not direct URL), get its topics
    for (const v1Sub of v1Subjects) {
      if (!v1Sub.route) continue; // Skip direct-URL subjects
      const subSlug = v1Sub.route.split("/").pop()!;

      // Find matching v2 subject
      const v2Sub = v2Subjects.find((s) => s.slug === subSlug);
      if (!v2Sub) {
        console.log(`  ⚠ No V2 subject for slug "${subSlug}"`);
        continue;
      }

      // Get V1 topic list for this subject
      const v1Topics: V1TopicItem[] = await fetchV1(
        `/app/notes/${levelSlug}/${subSlug}`
      );
      if (!v1Topics || !Array.isArray(v1Topics)) {
        console.log(`  ⚠ No V1 topics for ${subSlug}`);
        continue;
      }

      // Build v1RouteSlug -> v2TopicId mapping for route-based topics
      const v1RouteMapping: Record<string, number> = {};

      // Get v2 topics with their notes for matching
      const v2Topics = await db
        .select()
        .from(topics)
        .where(eq(topics.subjectId, v2Sub.id))
        .orderBy(asc(topics.sortOrder));

      for (const v1Topic of v1Topics) {
        if (!v1Topic.route) continue;
        const v1Slug = v1Topic.route.split("/").pop()!; // e.g., "math1_books_flow"

        // Try to match with v2 topic
        let matched = false;
        for (const v2Topic of v2Topics) {
          // Get leaf items from v1 for this topic
          const v1Leaf: V1LeafItem[] = await fetchV1(
            `/app/notes/${levelSlug}/${subSlug}/${v1Slug}`
          );
          if (!v1Leaf || !Array.isArray(v1Leaf) || v1Leaf.length === 0) continue;

          // Get v2 notes for this topic
          const v2Notes = await db
            .select()
            .from(notes)
            .where(eq(notes.topicId, v2Topic.id))
            .orderBy(asc(notes.sortOrder));

          if (v2Notes.length === 0) continue;

          // Match by checking if URLs overlap
          const v1Urls = new Set(v1Leaf.map((n) => n.url));
          const v2Urls = new Set(v2Notes.map((n) => n.url));
          const overlap = [...v1Urls].filter((u) => v2Urls.has(u)).length;

          if (overlap > 0 && overlap >= Math.min(v1Urls.size, v2Urls.size) * 0.5) {
            v1RouteMapping[v1Slug] = v2Topic.id;

            // Update v2 topic with v1 metadata
            const existingMeta =
              (v2Topic.metadata as Record<string, unknown>) || {};
            await db
              .update(topics)
              .set({
                metadata: {
                  ...existingMeta,
                  v1RouteSlug: v1Slug,
                  v1DisplayName: v1Topic.topic,
                },
                updatedAt: new Date(),
              })
              .where(eq(topics.id, v2Topic.id));

            matched = true;
            break;
          }
        }

        if (!matched) {
          // Log unmatched for debugging
          console.log(
            `  ⚠ Unmatched v1 topic: "${v1Topic.topic}" (${v1Slug}) in ${subSlug}`
          );
        }
      }

      // Store complete v1 topic list on the subject metadata
      const existingMeta =
        (v2Sub.metadata as Record<string, unknown>) || {};
      await db
        .update(subjects)
        .set({
          metadata: {
            ...existingMeta,
            v1Topics: v1Topics,
            v1RouteMapping: v1RouteMapping,
          },
          updatedAt: new Date(),
        })
        .where(eq(subjects.id, v2Sub.id));

      const urlCount = v1Topics.filter((t) => t.url).length;
      const routeCount = v1Topics.filter((t) => t.route).length;
      const mappedCount = Object.keys(v1RouteMapping).length;
      console.log(
        `  ✓ ${subSlug}: ${v1Topics.length} topics (${routeCount} route, ${urlCount} url), mapped ${mappedCount}/${routeCount}`
      );
    }
  }
}

async function syncLabTopics() {
  const db = getDb();
  console.log("\n=== Syncing lab topic metadata from V1 API ===\n");

  const allLevels = await db
    .select()
    .from(levels)
    .orderBy(asc(levels.sortOrder));

  for (const level of allLevels) {
    const levelSlug = level.slug;
    console.log(`\nLevel ${levelSlug}:`);

    // Get V1 lab subject list
    const v1LabSubs: Array<{ subName: string; route: string }> = await fetchV1(
      `/app/labs/${levelSlug}`
    );
    if (!v1LabSubs || !Array.isArray(v1LabSubs)) {
      console.log(`  No V1 lab data for level ${levelSlug}`);
      continue;
    }

    const v1LabTopicsMap: Record<string, V1TopicItem[]> = {};
    const v1LabLeafMap: Record<string, Record<string, V1LeafItem[]>> = {};

    for (const v1Sub of v1LabSubs) {
      const subSlug = v1Sub.route.split("/").pop()!;

      // Get V1 lab topic list
      const v1Topics: V1TopicItem[] = await fetchV1(
        `/app/labs/${levelSlug}/${subSlug}`
      );
      if (!v1Topics || !Array.isArray(v1Topics)) continue;

      v1LabTopicsMap[subSlug] = v1Topics;

      // Get leaf items for each route topic
      const leafMap: Record<string, V1LeafItem[]> = {};
      for (const t of v1Topics) {
        if (!t.route) continue;
        const topicSlug = t.route.split("/").pop()!;
        const leaf = await fetchV1(
          `/app/labs/${levelSlug}/${subSlug}/${topicSlug}`
        );
        if (leaf && Array.isArray(leaf)) {
          leafMap[topicSlug] = leaf;
        }
      }
      v1LabLeafMap[subSlug] = leafMap;

      const urlCount = v1Topics.filter((t) => t.url).length;
      const routeCount = v1Topics.filter((t) => t.route).length;
      console.log(
        `  ✓ ${subSlug}: ${v1Topics.length} topics (${routeCount} route, ${urlCount} url)`
      );
    }

    // Store on level metadata
    const existingMeta = (level.metadata as Record<string, unknown>) || {};
    await db
      .update(levels)
      .set({
        metadata: {
          ...existingMeta,
          v1LabTopics: v1LabTopicsMap,
          v1LabLeaves: v1LabLeafMap,
        },
        updatedAt: new Date(),
      })
      .where(eq(levels.id, level.id));
  }
}

async function syncNoteLeaves() {
  const db = getDb();
  console.log("\n=== Syncing note leaf metadata from V1 API ===\n");

  const allLevels = await db
    .select()
    .from(levels)
    .orderBy(asc(levels.sortOrder));

  for (const level of allLevels) {
    const levelSlug = level.slug;

    const v1Subjects: Array<{ subName: string; route?: string; url?: string }> =
      await fetchV1(`/app/notes/${levelSlug}`);
    if (!v1Subjects || !Array.isArray(v1Subjects)) continue;

    for (const v1Sub of v1Subjects) {
      if (!v1Sub.route) continue;
      const subSlug = v1Sub.route.split("/").pop()!;

      const v1Topics: V1TopicItem[] = await fetchV1(
        `/app/notes/${levelSlug}/${subSlug}`
      );
      if (!v1Topics || !Array.isArray(v1Topics)) continue;

      // Build complete leaf map: v1RouteSlug -> v1 leaf response
      const leafMap: Record<string, V1LeafItem[]> = {};
      for (const t of v1Topics) {
        if (!t.route) continue;
        const topicSlug = t.route.split("/").pop()!;
        const leaf = await fetchV1(
          `/app/notes/${levelSlug}/${subSlug}/${topicSlug}`
        );
        if (leaf && Array.isArray(leaf)) {
          leafMap[topicSlug] = leaf;
        }
      }

      // Store leaf map on subject metadata
      const v2Sub = await db
        .select()
        .from(subjects)
        .where(
          and(eq(subjects.levelId, level.id), eq(subjects.slug, subSlug))
        );

      if (v2Sub.length > 0) {
        const existingMeta =
          (v2Sub[0].metadata as Record<string, unknown>) || {};
        await db
          .update(subjects)
          .set({
            metadata: {
              ...existingMeta,
              v1Leaves: leafMap,
            },
            updatedAt: new Date(),
          })
          .where(eq(subjects.id, v2Sub[0].id));
        console.log(
          `  ✓ ${levelSlug}/${subSlug}: ${Object.keys(leafMap).length} leaf endpoints cached`
        );
      }
    }
  }
}

async function main() {
  console.log("Starting V1 → V2 compat data sync...");
  console.log(`V1 API: ${V1_BASE}`);

  // Check V1 is running
  try {
    const test = await fetchV1("/app/notes");
    if (!test) throw new Error("No response");
    console.log("V1 API reachable ✓");
  } catch {
    console.error("ERROR: V1 API not reachable at", V1_BASE);
    process.exit(1);
  }

  await syncNoteTopics();
  await syncNoteLeaves();
  await syncLabTopics();

  console.log("\n\n✅ Sync complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
