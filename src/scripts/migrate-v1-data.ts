/**
 * Migration script: notebot-engine-v1 -> notebot-engine-v2 (Postgres)
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/scripts/migrate-v1-data.ts <path-to-v1-repo>
 *
 * This script reads the v1 in-memory JS data files and inserts them into the
 * v2 Postgres database using Drizzle ORM.
 *
 * V1 data structure:
 *   src/controllers/appController/academic/notes/level{N}/level{N}Subs.js
 *     -> Array of { subName, route } or { subName, url }
 *
 *   src/controllers/flows/botReplies/note_levels/level_{N}/level_{N}_subs/{subject}/topics/{topic}.js
 *     -> Array of { text: "title\n\nurl" }
 *
 *   src/controllers/appController/academic/labs/level{N}/level{N}LabSubs.js
 *     -> Array of { subName, route } or { subName, url }
 *
 *   src/controllers/flows/botReplies/lab_levels/level_{N}/level_{N}_lab_subs/{subject}/lab_topics/{topic}.js
 *     -> Array of { text: "title\n\nurl" }
 */

import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { getDb, getPool } from "db/index";
import { levels, subjects, topics, notes, labReports, questionBanks, routines, results } from "db/schema";
import { eq } from "drizzle-orm";

// ---- Metadata extraction from v1 title strings ----
// V1 format examples:
//   "String Hand Note(Akib, 2018)" -> author: Akib, year: 2018
//   "Array Hand Note(Akib, AE-44)" -> author: Akib, batch: AE-44
//   "Hand Note(Mustafiz Sir, BA Group, 2018)" -> author: Mustafiz Sir, group: BA Group, year: 2018
//   "Questions(2012 - 18)" -> yearRange: "2012-2018"
//   "All Department Routine(L1,1)(2020)" -> level: 1, term: 1, year: 2020
function extractMetadata(title: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  // Extract all parenthetical groups
  const parenGroups = title.match(/\(([^)]+)\)/g);
  if (!parenGroups) return metadata;

  for (const group of parenGroups) {
    const content = group.slice(1, -1).trim();

    // Year range pattern: "2012 - 18" or "2012-2018"
    const yearRangeMatch = content.match(/^(\d{4})\s*-\s*(\d{2,4})$/);
    if (yearRangeMatch) {
      const startYear = yearRangeMatch[1];
      let endYear = yearRangeMatch[2];
      if (endYear.length === 2) {
        endYear = startYear.slice(0, 2) + endYear;
      }
      metadata.yearRange = `${startYear}-${endYear}`;
      continue;
    }

    // Single year pattern: "(2018)" or "(2019)"
    const singleYearMatch = content.match(/^(\d{4})$/);
    if (singleYearMatch) {
      metadata.year = parseInt(singleYearMatch[1]);
      continue;
    }

    // Level/Term pattern: "L1,1" or "L2,2"
    const levelTermMatch = content.match(/^L\s*(\d),\s*(\d)$/i);
    if (levelTermMatch) {
      metadata.level = parseInt(levelTermMatch[1]);
      metadata.term = parseInt(levelTermMatch[2]);
      continue;
    }

    // Comma-separated values with potential author, batch, year
    const parts = content.split(",").map((p) => p.trim());

    for (const part of parts) {
      // Year: 4-digit number
      if (/^\d{4}$/.test(part)) {
        metadata.year = parseInt(part);
        continue;
      }

      // Batch/dept code: like "AE-44", "DCE-44"
      if (/^[A-Z]{2,4}-\d{2,3}$/.test(part)) {
        metadata.batch = part;
        const [dept] = part.split("-");
        metadata.department = dept;
        continue;
      }

      // Group pattern: "BA Group"
      if (/group$/i.test(part)) {
        metadata.group = part;
        continue;
      }

      // Status flag: "(New)"
      if (/^new$/i.test(part)) {
        metadata.isNew = true;
        continue;
      }

      // Otherwise treat as author name (first non-year, non-batch part)
      if (!metadata.author && /^[A-Za-z.\s]+$/.test(part) && part.length > 1) {
        metadata.author = part;
      }
    }
  }

  // Extract content type from title prefix (before parentheses)
  const titleBeforeParens = title.replace(/\([^)]*\)/g, "").trim();
  if (titleBeforeParens) {
    const contentTypes = [
      "Hand Note", "Handnote", "Book", "Questions", "Suggestion",
      "With Data", "Lab Report", "Routine", "Syllabus", "Sheet",
    ];
    for (const ct of contentTypes) {
      if (titleBeforeParens.toLowerCase().includes(ct.toLowerCase())) {
        metadata.contentType = ct;
        break;
      }
    }
  }

  return metadata;
}

// ---- URL extraction (same regex as v1's UrlCatcher) ----
function extractUrlAndTitle(text: string): { title: string; url: string; metadata: Record<string, unknown> } | null {
  const urlRegex = /(https?:\/\/[^\s]*)/;
  const match = text.match(urlRegex);
  if (!match) return null;
  const url = match[1];
  const title = text
    .replace(urlRegex, "")
    .replace(/\n/g, "")
    .replace(/-\s*$/, "")
    .replace(/^[\s🔷⚡📌🔴🔰💡📗📙]+/, "")
    .trim();
  const cleanTitle = title || "Untitled";
  const metadata = extractMetadata(cleanTitle);
  return { title: cleanTitle, url, metadata };
}

// ---- Slug helpers ----
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractSubjectSlug(route: string): string {
  // route like "app/notes/1/math1" -> "math1"
  const parts = route.split("/");
  return parts[parts.length - 1];
}

// ---- V1 file loaders ----
function requireV1File(filePath: string): any {
  // Clear require cache to avoid stale data
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

function getDirectories(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function getJsFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".js"));
}

// ---- Main migration ----
async function migrate(v1Path: string) {
  const db = getDb();

  console.log("=== NoteBot V1 -> V2 Migration ===");
  console.log(`V1 path: ${v1Path}`);

  // Step 1: Create levels
  console.log("\n--- Migrating Levels ---");
  const levelNames = [
    { name: "level_1", displayName: "Level 1", slug: "1", sortOrder: 1 },
    { name: "level_2", displayName: "Level 2", slug: "2", sortOrder: 2 },
    { name: "level_3", displayName: "Level 3", slug: "3", sortOrder: 3 },
    { name: "level_4", displayName: "Level 4", slug: "4", sortOrder: 4 },
  ];

  const levelMap: Record<string, number> = {};

  for (const level of levelNames) {
    const [inserted] = await db
      .insert(levels)
      .values(level)
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      levelMap[level.slug] = inserted.id;
      console.log(`  Created level: ${level.displayName} (id=${inserted.id})`);
    } else {
      const [existing] = await db
        .select()
        .from(levels)
        .where(eq(levels.slug, level.slug));
      levelMap[level.slug] = existing.id;
      console.log(`  Level already exists: ${level.displayName} (id=${existing.id})`);
    }
  }

  // Step 2: Migrate notes (levels -> subjects -> topics -> notes)
  console.log("\n--- Migrating Notes ---");
  for (const levelNum of [1, 2, 3, 4]) {
    const levelId = levelMap[String(levelNum)];

    // Try to load level subs file
    const subsFilePaths = [
      path.join(v1Path, `src/controllers/appController/academic/notes/level${levelNum}/level${levelNum}Subs.js`),
      path.join(v1Path, `src/controllers/appController/academic/notes/level${levelNum}/Level${levelNum}Subs.js`),
    ];

    let subsFile = subsFilePaths.find(fileExists);
    if (!subsFile) {
      console.log(`  No subs file found for level ${levelNum}, skipping`);
      continue;
    }

    const subsData = requireV1File(subsFile);
    const subsList = Array.isArray(subsData) ? subsData : subsData.default || [];

    console.log(`  Level ${levelNum}: ${subsList.length} subjects`);
    let subjectOrder = 0;

    for (const sub of subsList) {
      subjectOrder++;
      const subName = sub.subName || sub.name || "Unknown";

      // If it's a direct URL (like "All QB"), insert as a question bank
      if (sub.url && !sub.route) {
        const qbMeta = extractMetadata(subName);
        await db.insert(questionBanks).values({
          levelId,
          subjectSlug: slugify(subName),
          title: subName,
          url: sub.url,
          sortOrder: subjectOrder,
          metadata: Object.keys(qbMeta).length > 0 ? qbMeta : undefined,
        }).onConflictDoNothing();
        console.log(`    QB/Direct link: ${subName}`);
        continue;
      }

      if (!sub.route) continue;

      const subjectSlug = extractSubjectSlug(sub.route);

      // Insert subject
      const [insertedSubject] = await db
        .insert(subjects)
        .values({
          levelId,
          name: subjectSlug,
          displayName: subName,
          slug: subjectSlug,
          sortOrder: subjectOrder,
        })
        .onConflictDoNothing()
        .returning();

      const subjectId = insertedSubject?.id;
      if (!subjectId) {
        console.log(`    Subject already exists or failed: ${subName}`);
        continue;
      }

      console.log(`    Subject: ${subName} (slug=${subjectSlug}, id=${subjectId})`);

      // Find topic files for this subject
      const topicDirPaths = [
        path.join(v1Path, `src/controllers/flows/botReplies/note_levels/level_${levelNum}/level_${levelNum}_subs/${subjectSlug}/topics`),
        path.join(v1Path, `src/controllers/appController/academic/notes/level${levelNum}/subs/${subjectSlug}/topics`),
      ];

      let topicDir = topicDirPaths.find((d) => fs.existsSync(d));

      if (!topicDir) {
        console.log(`      No topic dir found for ${subjectSlug}`);
        continue;
      }

      const topicFiles = getJsFiles(topicDir);
      let topicOrder = 0;

      for (const topicFile of topicFiles) {
        topicOrder++;
        const topicSlug = topicFile.replace(".js", "");
        const topicDisplayName = topicSlug
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .trim();

        // Insert topic
        const [insertedTopic] = await db
          .insert(topics)
          .values({
            subjectId,
            name: topicSlug,
            displayName: topicDisplayName,
            slug: slugify(topicSlug),
            sortOrder: topicOrder,
          })
          .returning();

        if (!insertedTopic) continue;

        // Load and parse topic data
        try {
          const topicData = requireV1File(path.join(topicDir, topicFile));
          const items = Array.isArray(topicData) ? topicData : topicData.default || [];

          let noteOrder = 0;
          for (const item of items) {
            const text = item.text || (typeof item === "string" ? item : "");
            if (!text) continue;

            const parsed = extractUrlAndTitle(text);
            if (!parsed) continue;

            noteOrder++;
            await db.insert(notes).values({
              topicId: insertedTopic.id,
              title: parsed.title,
              url: parsed.url,
              sortOrder: noteOrder,
              metadata: Object.keys(parsed.metadata).length > 0 ? parsed.metadata : undefined,
            });
          }

          console.log(`      Topic: ${topicSlug} -> ${noteOrder} notes`);
        } catch (err: any) {
          console.error(`      Error parsing topic ${topicFile}:`, err.message);
        }
      }
    }
  }

  // Step 3: Migrate lab reports
  console.log("\n--- Migrating Lab Reports ---");
  for (const levelNum of [1, 2, 3, 4]) {
    const levelId = levelMap[String(levelNum)];

    const labSubsDirPaths = [
      path.join(v1Path, `src/controllers/flows/botReplies/lab_levels/level_${levelNum}/level_${levelNum}_lab_subs`),
    ];

    const labSubsDir = labSubsDirPaths.find((d) => fs.existsSync(d));
    if (!labSubsDir) {
      console.log(`  No lab subs directory for level ${levelNum}`);
      continue;
    }

    const labSubjects = getDirectories(labSubsDir);
    console.log(`  Level ${levelNum}: ${labSubjects.length} lab subjects`);

    for (const labSubject of labSubjects) {
      const labTopicDirPaths = [
        path.join(labSubsDir, labSubject, "lab_topics"),
        path.join(labSubsDir, labSubject),
      ];

      let labTopicDir = labTopicDirPaths.find((d) => {
        if (!fs.existsSync(d)) return false;
        const files = getJsFiles(d);
        return files.length > 0;
      });

      if (!labTopicDir) continue;

      const labTopicFiles = getJsFiles(labTopicDir);
      let labOrder = 0;

      for (const labFile of labTopicFiles) {
        // Skip flow files (they define navigation, not data)
        if (labFile.includes("_flow") || labFile.includes("Flow")) continue;

        try {
          const labData = requireV1File(path.join(labTopicDir, labFile));
          const items = Array.isArray(labData) ? labData : labData.default || [];

          const topicName = labFile.replace(".js", "");

          for (const item of items) {
            const text = item.text || (typeof item === "string" ? item : "");
            if (!text) continue;

            const parsed = extractUrlAndTitle(text);
            if (!parsed) continue;

            labOrder++;
            await db.insert(labReports).values({
              levelId,
              subjectSlug: labSubject,
              topicName,
              title: parsed.title,
              url: parsed.url,
              sortOrder: labOrder,
              metadata: Object.keys(parsed.metadata).length > 0 ? parsed.metadata : undefined,
            });
          }

          console.log(`    Lab: ${labSubject}/${topicName} -> ${labOrder} items`);
        } catch (err: any) {
          console.error(`    Error parsing lab file ${labFile}:`, err.message);
        }
      }
    }
  }

  // Step 4: Migrate routines
  console.log("\n--- Migrating Routines ---");
  const routineFlowPaths = [
    path.join(v1Path, "src/controllers/flows/botReplies/routine_levels"),
    path.join(v1Path, "src/controllers/flows/botReplies"),
  ];

  for (const routineDir of routineFlowPaths) {
    if (!fs.existsSync(routineDir)) continue;

    const routineFiles = getJsFiles(routineDir).filter(
      (f) => f.toLowerCase().includes("routine")
    );

    for (const file of routineFiles) {
      try {
        const data = requireV1File(path.join(routineDir, file));
        const items = Array.isArray(data) ? data : data.default || [];

        let routineOrder = 0;
        for (const item of items) {
          // Handle both text blocks and button templates
          if (item.text) {
            const parsed = extractUrlAndTitle(item.text);
            if (!parsed) continue;
            routineOrder++;
            await db.insert(routines).values({
              levelId: levelMap["1"],
              title: parsed.title,
              url: parsed.url,
              sortOrder: routineOrder,
              metadata: Object.keys(parsed.metadata).length > 0 ? parsed.metadata : undefined,
            });
          } else if (item.attachment?.payload?.buttons) {
            for (const btn of item.attachment.payload.buttons) {
              if (btn.type === "web_url" && btn.url) {
                routineOrder++;
                await db.insert(routines).values({
                  levelId: levelMap["1"],
                  title: btn.title || "Routine",
                  url: btn.url,
                  sortOrder: routineOrder,
                });
              }
            }
          }
        }

        if (routineOrder > 0) {
          console.log(`  Routines from ${file}: ${routineOrder} items`);
        }
      } catch (err: any) {
        console.error(`  Error parsing routine file ${file}:`, err.message);
      }
    }
  }

  // Step 5: Migrate results
  console.log("\n--- Migrating Results ---");
  const resultFlowPaths = [
    path.join(v1Path, "src/controllers/flows/botReplies/resultFlow.js"),
    path.join(v1Path, "src/controllers/flows/botReplies/result_flow.js"),
  ];

  for (const resultFile of resultFlowPaths) {
    if (!fileExists(resultFile)) continue;

    try {
      const data = requireV1File(resultFile);
      const items = Array.isArray(data) ? data : data.default || [];

      let resultOrder = 0;
      for (const item of items) {
        if (item.text) {
          const parsed = extractUrlAndTitle(item.text);
          if (!parsed) continue;
          resultOrder++;
          await db.insert(results).values({
            title: parsed.title,
            url: parsed.url,
            sortOrder: resultOrder,
            metadata: Object.keys(parsed.metadata).length > 0 ? parsed.metadata : undefined,
          });
        } else if (item.attachment?.payload?.buttons) {
          for (const btn of item.attachment.payload.buttons) {
            if (btn.type === "web_url" && btn.url) {
              resultOrder++;
              await db.insert(results).values({
                title: btn.title || "Result",
                url: btn.url,
                sortOrder: resultOrder,
              });
            }
          }
        }
      }

      console.log(`  Results from ${path.basename(resultFile)}: ${resultOrder} items`);
    } catch (err: any) {
      console.error(`  Error parsing result file:`, err.message);
    }
  }

  // Summary
  console.log("\n=== Migration Summary ===");
  const [levelCount] = await db.select({ count: levels.id }).from(levels);
  const [subjectCount] = await db.select({ count: subjects.id }).from(subjects);
  const [topicCount] = await db.select({ count: topics.id }).from(topics);
  const [noteCount] = await db.select({ count: notes.id }).from(notes);
  const [labCount] = await db.select({ count: labReports.id }).from(labReports);
  const [qbCount] = await db.select({ count: questionBanks.id }).from(questionBanks);
  const [routineCount] = await db.select({ count: routines.id }).from(routines);
  const [resultCount] = await db.select({ count: results.id }).from(results);

  console.log(`  Levels:         ${levelCount?.count || 0}`);
  console.log(`  Subjects:       ${subjectCount?.count || 0}`);
  console.log(`  Topics:         ${topicCount?.count || 0}`);
  console.log(`  Notes:          ${noteCount?.count || 0}`);
  console.log(`  Lab Reports:    ${labCount?.count || 0}`);
  console.log(`  Question Banks: ${qbCount?.count || 0}`);
  console.log(`  Routines:       ${routineCount?.count || 0}`);
  console.log(`  Results:        ${resultCount?.count || 0}`);
}

// ---- Entry point ----
const v1Path = process.argv[2];

if (!v1Path) {
  console.error("Usage: npx ts-node -r tsconfig-paths/register src/scripts/migrate-v1-data.ts <path-to-v1-repo>");
  process.exit(1);
}

const resolvedPath = path.resolve(v1Path);

if (!fs.existsSync(resolvedPath)) {
  console.error(`V1 repo path does not exist: ${resolvedPath}`);
  process.exit(1);
}

migrate(resolvedPath)
  .then(() => {
    console.log("\n✅ Migration complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Migration failed:", err);
    process.exit(1);
  });
