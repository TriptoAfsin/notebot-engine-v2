/**
 * Migration script: notebot-engine-v1 -> notebot-engine-v2 (Postgres)
 *
 * Usage: npx tsx src/scripts/migrate-v1-data.ts <path-to-v1-repo>
 *
 * Reads ALL v1 data and inserts into the v2 Postgres database.
 */

import dotenv from "dotenv";
dotenv.config();

import path from "path";
import fs from "fs";
import { getDb, getPool } from "db/index";
import {
  levels,
  subjects,
  topics,
  notes,
  labReports,
  questionBanks,
  routines,
  results,
} from "db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ---- Metadata extraction from v1 title strings ----
function extractMetadata(title: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  const parenGroups = title.match(/\(([^)]+)\)/g);
  if (!parenGroups) return metadata;

  for (const group of parenGroups) {
    const content = group.slice(1, -1).trim();

    // Year range: "2012 - 18" or "2012-2018"
    const yearRangeMatch = content.match(/^(\d{4})\s*-\s*(\d{2,4})$/);
    if (yearRangeMatch) {
      const startYear = yearRangeMatch[1];
      let endYear = yearRangeMatch[2];
      if (endYear.length === 2) endYear = startYear.slice(0, 2) + endYear;
      metadata.yearRange = `${startYear}-${endYear}`;
      continue;
    }

    // Single year: "(2018)"
    const singleYearMatch = content.match(/^(\d{4})$/);
    if (singleYearMatch) {
      metadata.year = parseInt(singleYearMatch[1]);
      continue;
    }

    // Level/Term: "L1,1"
    const levelTermMatch = content.match(/^L\s*(\d),\s*(\d)$/i);
    if (levelTermMatch) {
      metadata.level = parseInt(levelTermMatch[1]);
      metadata.term = parseInt(levelTermMatch[2]);
      continue;
    }

    // Comma-separated
    const parts = content.split(",").map((p) => p.trim());
    for (const part of parts) {
      if (/^\d{4}$/.test(part)) {
        metadata.year = parseInt(part);
        continue;
      }
      if (/^[A-Z]{2,4}-\d{2,3}$/.test(part)) {
        metadata.batch = part;
        metadata.department = part.split("-")[0];
        continue;
      }
      if (/group$/i.test(part)) {
        metadata.group = part;
        continue;
      }
      if (/^new$/i.test(part)) {
        metadata.isNew = true;
        continue;
      }
      if (!metadata.author && /^[A-Za-z.\s]+$/.test(part) && part.length > 1) {
        metadata.author = part;
      }
    }
  }

  // Content type from title
  const titleBeforeParens = title.replace(/\([^)]*\)/g, "").trim();
  if (titleBeforeParens) {
    const contentTypes = [
      "Hand Note",
      "Handnote",
      "Book",
      "Questions",
      "Suggestion",
      "Lab Report",
      "Routine",
      "Syllabus",
      "Sheet",
      "Procedure",
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

// ---- URL extraction ----
function extractUrlAndTitle(
  text: string
): { title: string; url: string; metadata: Record<string, unknown> } | null {
  const urlRegex = /(https?:\/\/[^\s]*)/;
  const match = text.match(urlRegex);
  if (!match) return null;
  const url = match[1];
  const title = text
    .replace(urlRegex, "")
    .replace(/\n/g, "")
    .replace(/-\s*$/, "")
    .replace(/^[\s🔷⚡📌🔴🔰💡📗📙🟡🟣]+/, "")
    .trim();
  const cleanTitle = title || "Untitled";
  const metadata = extractMetadata(cleanTitle);
  return { title: cleanTitle, url, metadata };
}

// ---- Helpers ----
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractSubjectSlug(route: string): string {
  const parts = route.split("/");
  return parts[parts.length - 1];
}

function requireV1File(filePath: string): any {
  delete require.cache[require.resolve(filePath)];
  return require(filePath);
}

function fileExists(fp: string): boolean {
  return fs.existsSync(fp);
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
  return fs.readdirSync(dirPath).filter((f) => f.endsWith(".js"));
}

/**
 * Extract web_url buttons from a Messenger button template structure.
 * Handles both raw template objects and objects returned by grroupedButtonBlockGen.
 */
function extractButtonUrls(
  item: any
): { title: string; url: string; metadata: Record<string, unknown> }[] {
  const results: {
    title: string;
    url: string;
    metadata: Record<string, unknown>;
  }[] = [];

  const buttons = item?.attachment?.payload?.buttons;
  if (!buttons || !Array.isArray(buttons)) return results;

  for (const btn of buttons) {
    if (btn.type === "web_url" && btn.url) {
      const title = btn.title || "Untitled";
      const metadata = extractMetadata(title);
      results.push({ title, url: btn.url, metadata });
    }
  }

  return results;
}

// ---- Main migration ----
async function migrate(v1Path: string) {
  const db = getDb();

  console.log("=== NoteBot V1 -> V2 Migration ===");
  console.log(`V1 path: ${v1Path}\n`);

  // Clear existing data (fresh migration)
  console.log("--- Clearing existing data ---");
  await db.delete(notes);
  await db.delete(topics);
  await db.delete(subjects);
  await db.delete(labReports);
  await db.delete(questionBanks);
  await db.delete(routines);
  await db.delete(results);
  await db.delete(levels);
  console.log("  Cleared all tables.\n");

  // ============================
  // Step 1: Create levels
  // ============================
  console.log("--- Migrating Levels ---");
  const levelDefs = [
    { name: "level_1", displayName: "Level 1", slug: "1", sortOrder: 1 },
    { name: "level_2", displayName: "Level 2", slug: "2", sortOrder: 2 },
    { name: "level_3", displayName: "Level 3", slug: "3", sortOrder: 3 },
    { name: "level_4", displayName: "Level 4", slug: "4", sortOrder: 4 },
  ];

  const levelMap: Record<string, number> = {};

  for (const level of levelDefs) {
    const [inserted] = await db.insert(levels).values(level).returning();
    levelMap[level.slug] = inserted.id;
    console.log(`  Created level: ${level.displayName} (id=${inserted.id})`);
  }

  // ============================
  // Step 2: Migrate Notes
  // ============================
  console.log("\n--- Migrating Notes ---");
  let totalNotes = 0;
  let totalSubjects = 0;
  let totalTopics = 0;
  let totalQBs = 0;

  for (const levelNum of [1, 2, 3, 4]) {
    const levelId = levelMap[String(levelNum)];

    // Load level subs file
    const subsFilePaths = [
      path.join(
        v1Path,
        `src/controllers/appController/academic/notes/level${levelNum}/level${levelNum}Subs.js`
      ),
      path.join(
        v1Path,
        `src/controllers/appController/academic/notes/level${levelNum}/Level${levelNum}Subs.js`
      ),
    ];

    const subsFile = subsFilePaths.find(fileExists);
    if (!subsFile) {
      console.log(`  No subs file for level ${levelNum}, skipping`);
      continue;
    }

    const subsData = requireV1File(subsFile);
    const subsList = Array.isArray(subsData)
      ? subsData
      : subsData.default || [];

    console.log(`  Level ${levelNum}: ${subsList.length} entries`);
    let subjectOrder = 0;

    for (const sub of subsList) {
      subjectOrder++;
      const subName = sub.subName || sub.name || "Unknown";

      // Direct URL entries -> question_banks table
      if (sub.url && !sub.route) {
        const qbMeta = extractMetadata(subName);
        // Clean emoji from subName for slug
        const cleanName = subName.replace(/[🔴🟣🔷⚡📌🔰💡📗📙🟡\s]+/g, "").trim();
        await db.insert(questionBanks).values({
          levelId,
          subjectSlug: slugify(cleanName || subName),
          title: subName,
          url: sub.url,
          sortOrder: subjectOrder,
          metadata:
            Object.keys(qbMeta).length > 0 ? qbMeta : undefined,
        });
        totalQBs++;
        console.log(`    QB/Direct: ${subName}`);
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
        .returning();

      if (!insertedSubject) {
        console.log(`    Subject insert failed: ${subName}`);
        continue;
      }

      totalSubjects++;
      console.log(
        `    Subject: ${subName} (slug=${subjectSlug}, id=${insertedSubject.id})`
      );

      // Find topic files in flows/botReplies
      const topicDirPaths = [
        path.join(
          v1Path,
          `src/controllers/flows/botReplies/note_levels/level_${levelNum}/level_${levelNum}_subs/${subjectSlug}/topics`
        ),
        path.join(
          v1Path,
          `src/controllers/appController/academic/notes/level${levelNum}/subs/${subjectSlug}/topics`
        ),
      ];

      const topicDir = topicDirPaths.find((d) => fs.existsSync(d));
      if (!topicDir) {
        console.log(`      No topic dir for ${subjectSlug}`);
        continue;
      }

      const topicFiles = getJsFiles(topicDir);
      let topicOrder = 0;

      for (const topicFile of topicFiles) {
        // Skip flow files
        if (topicFile.includes("_flow") || topicFile.includes("Flow"))
          continue;

        topicOrder++;
        const topicSlug = topicFile.replace(".js", "");
        const topicDisplayName = topicSlug
          .replace(/([A-Z])/g, " $1")
          .replace(/_/g, " ")
          .trim();

        const [insertedTopic] = await db
          .insert(topics)
          .values({
            subjectId: insertedSubject.id,
            name: topicSlug,
            displayName: topicDisplayName,
            slug: slugify(topicSlug),
            sortOrder: topicOrder,
          })
          .returning();

        if (!insertedTopic) continue;
        totalTopics++;

        // Load and parse topic data
        try {
          const topicData = requireV1File(path.join(topicDir, topicFile));
          const items = Array.isArray(topicData)
            ? topicData
            : topicData.default || [];

          let noteOrder = 0;
          for (const item of items) {
            const text =
              item.text || (typeof item === "string" ? item : "");
            if (!text) continue;

            const parsed = extractUrlAndTitle(text);
            if (!parsed) continue;

            noteOrder++;
            await db.insert(notes).values({
              topicId: insertedTopic.id,
              title: parsed.title,
              url: parsed.url,
              sortOrder: noteOrder,
              metadata:
                Object.keys(parsed.metadata).length > 0
                  ? parsed.metadata
                  : undefined,
            });
            totalNotes++;
          }

          console.log(`      Topic: ${topicSlug} -> ${noteOrder} notes`);
        } catch (err: any) {
          console.error(
            `      Error parsing topic ${topicFile}:`,
            err.message
          );
        }
      }
    }
  }

  // ============================
  // Step 3: Migrate Lab Reports
  // ============================
  console.log("\n--- Migrating Lab Reports ---");
  let totalLabs = 0;

  for (const levelNum of [1, 2, 3, 4]) {
    const levelId = levelMap[String(levelNum)];

    // Load lab subs config file
    const labSubsFilePaths = [
      path.join(
        v1Path,
        `src/controllers/appController/academic/labReport/level${levelNum}/level${levelNum}Labs.js`
      ),
      path.join(
        v1Path,
        `src/controllers/appController/academic/labReport/level${levelNum}/Level${levelNum}Labs.js`
      ),
    ];

    const labSubsFile = labSubsFilePaths.find(fileExists);

    // Also scan the flow directory for lab subs
    const labFlowDir = path.join(
      v1Path,
      `src/controllers/flows/botReplies/lab_levels/level_${levelNum}/level_${levelNum}_lab_subs`
    );

    if (!labSubsFile && !fs.existsSync(labFlowDir)) {
      console.log(`  No lab data for level ${levelNum}`);
      continue;
    }

    // Build a mapping: app slug -> flow dir name
    // The flow dirs may have different names: chem1 -> che_1, ap1 -> ap_1, etc.
    const flowSubDirs = getDirectories(labFlowDir);

    // Load lab subs from config file if available
    let labSubsList: any[] = [];
    if (labSubsFile) {
      const labSubsData = requireV1File(labSubsFile);
      labSubsList = Array.isArray(labSubsData)
        ? labSubsData
        : labSubsData.default || [];
    }

    console.log(
      `  Level ${levelNum}: ${labSubsList.length} lab subjects (config), ${flowSubDirs.length} flow dirs`
    );

    // Process each flow directory (this is the actual data)
    for (const flowDir of flowSubDirs) {
      const flowDirPath = path.join(labFlowDir, flowDir);

      // Find the matching display name from config
      const matchingSub = labSubsList.find((sub: any) => {
        if (!sub.route) return false;
        const slug = extractSubjectSlug(sub.route);
        // Direct match
        if (slug === flowDir) return true;
        // Common renames: chem1->che_1, ap1->ap_1, phy1->phy_1, etc.
        const normalized = slug
          .replace(/(\d)$/, "_$1")
          .replace("chem", "che")
          .replace("ap", "ap")
          .replace("phy", "phy");
        if (normalized === flowDir) return true;
        // More aggressive matching
        const flowNorm = flowDir.replace(/_/g, "");
        const slugNorm = slug.replace(/_/g, "");
        if (flowNorm === slugNorm) return true;
        return false;
      });

      const subjectDisplayName =
        matchingSub?.subName || flowDir.replace(/_/g, " ").toUpperCase();
      const subjectSlug = flowDir;

      // Find topic files inside this flow dir
      // Pattern 1: {subject}_lab_topics/ subdirectory
      // Pattern 2: direct JS files in the subject dir
      const topicSubDirs = getDirectories(flowDirPath).filter(
        (d) => d.includes("lab_topics") || d.includes("topics")
      );

      let topicDir: string | undefined;
      if (topicSubDirs.length > 0) {
        topicDir = path.join(flowDirPath, topicSubDirs[0]);
      }

      // Get JS files from both the topic dir and the flow dir itself
      const topicJsFiles = topicDir ? getJsFiles(topicDir) : [];
      const flowJsFiles = getJsFiles(flowDirPath);

      // Combine, but exclude flow files
      const allDataFiles: { file: string; dir: string }[] = [];

      for (const f of topicJsFiles) {
        if (!f.includes("Flow") && !f.includes("_flow")) {
          allDataFiles.push({ file: f, dir: topicDir! });
        }
      }

      // Also check flow dir for data files (some labs have data in the root)
      for (const f of flowJsFiles) {
        if (!f.includes("Flow") && !f.includes("_flow")) {
          // Only add if not already covered by topic dir
          if (!topicJsFiles.includes(f)) {
            allDataFiles.push({ file: f, dir: flowDirPath });
          }
        }
      }

      if (allDataFiles.length === 0) {
        // Try to extract from flow file directly (button templates with web_urls)
        const flowFiles = flowJsFiles.filter(
          (f) => f.includes("Flow") || f.includes("_flow")
        );
        for (const ff of flowFiles) {
          try {
            const flowData = requireV1File(path.join(flowDirPath, ff));
            const items = Array.isArray(flowData)
              ? flowData
              : flowData.default || [];
            let labOrder = 0;
            for (const item of items) {
              const buttons = extractButtonUrls(item);
              for (const btn of buttons) {
                labOrder++;
                await db.insert(labReports).values({
                  levelId,
                  subjectSlug,
                  topicName: subjectDisplayName,
                  title: btn.title,
                  url: btn.url,
                  sortOrder: labOrder,
                  metadata:
                    Object.keys(btn.metadata).length > 0
                      ? btn.metadata
                      : undefined,
                });
                totalLabs++;
              }
            }
            if (labOrder > 0) {
              console.log(
                `    Lab flow: ${flowDir}/${ff} -> ${labOrder} items`
              );
            }
          } catch (err: any) {
            // Ignore flow parse errors (they have require() calls to generators)
          }
        }
        continue;
      }

      let labOrderTotal = 0;

      for (const { file, dir } of allDataFiles) {
        const topicName = file.replace(".js", "");

        try {
          const data = requireV1File(path.join(dir, file));
          const items = Array.isArray(data) ? data : data.default || [];

          for (const item of items) {
            const text =
              item.text || (typeof item === "string" ? item : "");
            if (!text) {
              // Try button extraction
              const buttons = extractButtonUrls(item);
              for (const btn of buttons) {
                labOrderTotal++;
                await db.insert(labReports).values({
                  levelId,
                  subjectSlug,
                  topicName,
                  title: btn.title,
                  url: btn.url,
                  sortOrder: labOrderTotal,
                  metadata:
                    Object.keys(btn.metadata).length > 0
                      ? btn.metadata
                      : undefined,
                });
                totalLabs++;
              }
              continue;
            }

            const parsed = extractUrlAndTitle(text);
            if (!parsed) continue;

            labOrderTotal++;
            await db.insert(labReports).values({
              levelId,
              subjectSlug,
              topicName,
              title: parsed.title,
              url: parsed.url,
              sortOrder: labOrderTotal,
              metadata:
                Object.keys(parsed.metadata).length > 0
                  ? parsed.metadata
                  : undefined,
            });
            totalLabs++;
          }
        } catch (err: any) {
          console.error(
            `    Error parsing lab file ${file}:`,
            err.message
          );
        }
      }

      if (labOrderTotal > 0) {
        console.log(
          `    Lab: ${flowDir} -> ${labOrderTotal} items`
        );
      }
    }
  }

  // ============================
  // Step 4: Migrate Routines
  // ============================
  console.log("\n--- Migrating Routines ---");
  let totalRoutines = 0;

  const routineBaseDir = path.join(
    v1Path,
    "src/controllers/flows/botReplies/routine_levels"
  );

  if (fs.existsSync(routineBaseDir)) {
    // Process each level directory
    for (const levelNum of [1, 2, 3, 4]) {
      const levelId = levelMap[String(levelNum)];
      const levelDir = path.join(routineBaseDir, `level_${levelNum}`);

      if (!fs.existsSync(levelDir)) continue;

      // Term files are in terms/ subdirectory
      const termsDir = path.join(levelDir, "terms");
      const termFiles = getJsFiles(termsDir);

      for (const termFile of termFiles) {
        try {
          const data = requireV1File(path.join(termsDir, termFile));
          const items = Array.isArray(data) ? data : data.default || [];

          // Extract term from filename: l1t1Routine.js -> term 1
          const termMatch = termFile.match(/l(\d)t(\d)/i);
          const term = termMatch ? `Term ${termMatch[2]}` : "";
          const department = termMatch
            ? `Level ${termMatch[1]} Term ${termMatch[2]}`
            : termFile.replace(".js", "");

          let routineOrder = 0;

          for (const item of items) {
            const buttons = extractButtonUrls(item);
            for (const btn of buttons) {
              routineOrder++;
              await db.insert(routines).values({
                levelId,
                term,
                department: btn.title,
                title: `${department} - ${btn.title}`,
                url: btn.url,
                sortOrder: routineOrder,
                metadata:
                  Object.keys(btn.metadata).length > 0
                    ? btn.metadata
                    : undefined,
              });
              totalRoutines++;
            }
          }

          if (routineOrder > 0) {
            console.log(
              `  Routine: Level ${levelNum} ${termFile} -> ${routineOrder} items`
            );
          }
        } catch (err: any) {
          console.error(
            `  Error parsing routine ${termFile}:`,
            err.message
          );
        }
      }
    }

    // Online routines
    const onlineDir = path.join(routineBaseDir, "online_routine");
    if (fs.existsSync(onlineDir)) {
      const onlineLevelDirs = getDirectories(onlineDir);

      for (const olDir of onlineLevelDirs) {
        const olPath = path.join(onlineDir, olDir);
        const olFiles = getJsFiles(olPath);

        // Determine level from dir name: "level2" -> 2
        const olLevelMatch = olDir.match(/(\d)/);
        const olLevelNum = olLevelMatch ? parseInt(olLevelMatch[1]) : 1;
        const levelId = levelMap[String(olLevelNum)] || levelMap["1"];

        for (const olFile of olFiles) {
          try {
            const data = requireV1File(path.join(olPath, olFile));
            const items = Array.isArray(data) ? data : data.default || [];

            let routineOrder = 0;
            for (const item of items) {
              const buttons = extractButtonUrls(item);
              for (const btn of buttons) {
                routineOrder++;
                await db.insert(routines).values({
                  levelId,
                  title: `Online - ${btn.title}`,
                  url: btn.url,
                  sortOrder: routineOrder,
                  metadata: { online: true },
                });
                totalRoutines++;
              }
            }

            if (routineOrder > 0) {
              console.log(
                `  Online Routine: ${olDir}/${olFile} -> ${routineOrder} items`
              );
            }
          } catch (err: any) {
            console.error(
              `  Error parsing online routine ${olFile}:`,
              err.message
            );
          }
        }
      }
    }
  }

  // ============================
  // Step 5: Migrate Results
  // ============================
  console.log("\n--- Migrating Results ---");
  let totalResults = 0;

  const resultBaseDir = path.join(
    v1Path,
    "src/controllers/flows/botReplies/result_flows"
  );

  if (fs.existsSync(resultBaseDir)) {
    const resultCategories = getDirectories(resultBaseDir);

    for (const category of resultCategories) {
      const categoryDir = path.join(resultBaseDir, category);

      // Determine category label
      let categoryLabel = category
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      if (category === "academic_result") categoryLabel = "Academic";
      else if (category === "admission_result") categoryLabel = "Admission";
      else if (category === "affli_result") categoryLabel = "Affiliation";
      else if (category === "retake_result") categoryLabel = "Retake";

      // Process files in years/ subdirectory (actual data with URLs)
      const yearsDir = path.join(categoryDir, "years");
      const yearFiles = getJsFiles(yearsDir);

      // Also process root-level files that have direct data
      const rootFiles = getJsFiles(categoryDir);

      const allResultFiles: { file: string; dir: string }[] = [];
      for (const f of yearFiles) {
        allResultFiles.push({ file: f, dir: yearsDir });
      }
      for (const f of rootFiles) {
        allResultFiles.push({ file: f, dir: categoryDir });
      }

      for (const { file, dir } of allResultFiles) {
        try {
          const data = requireV1File(path.join(dir, file));
          const items = Array.isArray(data) ? data : data.default || [];

          // Extract year from filename: 2018AcaResult.js -> 2018
          const yearMatch = file.match(/(\d{4})/);
          const year = yearMatch ? yearMatch[1] : "";

          let resultOrder = 0;
          for (const item of items) {
            const buttons = extractButtonUrls(item);
            for (const btn of buttons) {
              resultOrder++;
              const meta: Record<string, unknown> = {
                category: categoryLabel,
              };
              if (year) meta.year = parseInt(year);
              if (Object.keys(btn.metadata).length > 0) {
                Object.assign(meta, btn.metadata);
              }

              await db.insert(results).values({
                title: `${categoryLabel}${year ? ` ${year}` : ""} - ${btn.title}`,
                url: btn.url,
                category: categoryLabel,
                sortOrder: resultOrder,
                metadata: meta,
              });
              totalResults++;
            }
          }

          if (resultOrder > 0) {
            console.log(
              `  Result: ${category}/${file} -> ${resultOrder} items`
            );
          }
        } catch (err: any) {
          // Files using generator functions (grroupedButtonBlockGen) require
          // the helper modules. Let's try to load them if available.
          console.error(
            `  Error parsing result ${file}: ${err.message}`
          );
        }
      }
    }
  }

  // ============================
  // Summary
  // ============================
  console.log("\n=== Migration Summary ===");

  const [levelCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(levels);
  const [subjectCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(subjects);
  const [topicCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(topics);
  const [noteCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(notes);
  const [labCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(labReports);
  const [qbCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(questionBanks);
  const [routineCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(routines);
  const [resultCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(results);

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
  console.error(
    "Usage: npx tsx src/scripts/migrate-v1-data.ts <path-to-v1-repo>"
  );
  process.exit(1);
}

const resolvedPath = path.resolve(v1Path);

if (!fs.existsSync(resolvedPath)) {
  console.error(`V1 repo path does not exist: ${resolvedPath}`);
  process.exit(1);
}

migrate(resolvedPath)
  .then(() => {
    console.log("\nMigration complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\nMigration failed:", err);
    process.exit(1);
  });
