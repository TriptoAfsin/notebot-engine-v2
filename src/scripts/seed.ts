/**
 * Seed script: Populate the database with sample data for testing.
 *
 * Usage: npx ts-node -r tsconfig-paths/register src/scripts/seed.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { getDb, getPool } from "db/index";
import { levels, subjects, topics, notes, labReports, questionBanks, routines, results } from "db/schema";

async function seed() {
  const db = getDb();

  console.log("=== Seeding Database ===");

  // Clear existing data
  await db.delete(notes);
  await db.delete(topics);
  await db.delete(subjects);
  await db.delete(labReports);
  await db.delete(questionBanks);
  await db.delete(routines);
  await db.delete(results);
  await db.delete(levels);

  // Seed levels
  const [l1, l2, l3, l4] = await db
    .insert(levels)
    .values([
      { name: "level_1", displayName: "Level 1", slug: "1", sortOrder: 1 },
      { name: "level_2", displayName: "Level 2", slug: "2", sortOrder: 2 },
      { name: "level_3", displayName: "Level 3", slug: "3", sortOrder: 3 },
      { name: "level_4", displayName: "Level 4", slug: "4", sortOrder: 4 },
    ])
    .returning();

  console.log(`  Created ${4} levels`);

  // Seed some subjects
  const [math1, chem1, phy1] = await db
    .insert(subjects)
    .values([
      { levelId: l1.id, name: "math1", displayName: "Math-I", slug: "math1", sortOrder: 1 },
      { levelId: l1.id, name: "chem1", displayName: "Chemistry-I", slug: "chem1", sortOrder: 2 },
      { levelId: l1.id, name: "phy1", displayName: "Physics-I", slug: "phy1", sortOrder: 3 },
    ])
    .returning();

  console.log(`  Created ${3} subjects`);

  // Seed topics for math1
  const [mathBooks, mathQuestions] = await db
    .insert(topics)
    .values([
      { subjectId: math1.id, name: "math1_books_flow", displayName: "Books", slug: "math1-books-flow", sortOrder: 1 },
      { subjectId: math1.id, name: "math1_ques_flow", displayName: "Questions", slug: "math1-ques-flow", sortOrder: 2 },
    ])
    .returning();

  console.log(`  Created ${2} topics`);

  // Seed notes for math1 books
  await db.insert(notes).values([
    { topicId: mathBooks.id, title: "Higher Engineering Mathematics (B.S. Grewal)", url: "https://drive.google.com/file/d/example1/view", sortOrder: 1 },
    { topicId: mathBooks.id, title: "Advanced Engineering Mathematics (Erwin Kreyszig)", url: "https://drive.google.com/file/d/example2/view", sortOrder: 2 },
  ]);

  console.log(`  Created ${2} notes`);

  // Seed some lab reports
  await db.insert(labReports).values([
    { levelId: l1.id, subjectSlug: "chem1", topicName: "chem1LabExperiment1", title: "Acid-Base Titration", url: "https://drive.google.com/file/d/example3/view", sortOrder: 1 },
  ]);

  console.log(`  Created ${1} lab reports`);

  // Seed question banks
  await db.insert(questionBanks).values([
    { levelId: l1.id, subjectSlug: "math1", title: "All Level 1 QBs", url: "https://drive.google.com/drive/folders/example4", sortOrder: 1 },
  ]);

  console.log(`  Created ${1} question banks`);

  // Seed routines
  await db.insert(routines).values([
    { levelId: l1.id, term: "1st", title: "Level 1 Routine 2024", url: "https://drive.google.com/file/d/example5/view", sortOrder: 1 },
  ]);

  console.log(`  Created ${1} routines`);

  // Seed results
  await db.insert(results).values([
    { title: "BUTEX Result Portal", url: "https://result.butex.edu.bd", category: "portal", sortOrder: 1 },
  ]);

  console.log(`  Created ${1} results`);

  console.log("\n✅ Seed complete!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
