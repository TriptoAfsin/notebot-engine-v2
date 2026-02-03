/**
 * Supplementary migration: Add missing direct-URL subjects and lab display name mappings.
 * These items are "shortcut" links from v1 that don't have topics underneath them.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register src/scripts/fix-compat-data.ts
 */

import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

// V1 direct-link subjects per level (items with url instead of route)
const directUrlSubjects: Record<
  string,
  { subName: string; url: string; sortOrder: number }[]
> = {
  "1": [
    { subName: "All QB", url: "https://drive.google.com/drive/folders/1XSV3_96TvLXmkqnhK6zFQQ67jCj4_NzL", sortOrder: 0 },
    { subName: "FMG(Mgmt)", url: "https://drive.google.com/file/d/1q6llewteDyEz1TQegSB4rNF8EMxlsOr5/view?usp=sharing", sortOrder: 100 },
    { subName: "IESE", url: "https://drive.google.com/drive/folders/1oAPDYr4C3DNDEiSJrL02UqBtkybhM04x?usp=sharing", sortOrder: 101 },
    { subName: "TNF", url: "https://drive.google.com/drive/folders/1ZfKkKd7abecno6A8qInDq_aYLFzn3ksi?usp=sharing", sortOrder: 102 },
    { subName: "BS", url: "https://drive.google.com/drive/folders/17wWNfGNjyPGDq1Gwekwjtkyvv16RTHYy?usp=sharing", sortOrder: 103 },
  ],
  "2": [
    { subName: "All QB", url: "https://drive.google.com/drive/folders/1AlmeMT52FQC02IhfvWuVPuDn8qatE_RQ", sortOrder: 0 },
    { subName: "QB Till 2019", url: "https://drive.google.com/file/d/1ce4mTpJ0S0yi8tYQvvEGn_4BtlbcjI6m/view", sortOrder: 1 },
    { subName: "Online(2021)", url: "https://drive.google.com/drive/folders/1LxaFjV2a7MdCRpG5XxyqO49gY_CcmcS_?usp=sharing", sortOrder: 2 },
    { subName: "2022(2-1)", url: "https://drive.google.com/file/d/1SR70b7AQvJ0yomIAUuE1QTBJzUqMT0KG/view?usp=sharing", sortOrder: 3 },
    { subName: "Weaving-I", url: "https://drive.google.com/drive/folders/1SFjq8TMmb9X4O2d74-Z8z8TbknwEslkG?usp=sharing", sortOrder: 100 },
    { subName: "OM(TEM)", url: "https://drive.google.com/drive/folders/10RWll1pyS1cZFGV32vkaSjA2MdRM2T10?usp=sharing", sortOrder: 101 },
    { subName: "IDCC(ESE)", url: "https://drive.google.com/drive/folders/1QEdJyJyPuYJ6Co9dWI5Zya0xxaioF8lW?usp=sharing", sortOrder: 102 },
    { subName: "TQCFT", url: "https://drive.google.com/drive/folders/1z1vdls2FvQKW3jh7VriVtbVh8plynwje?usp=sharing", sortOrder: 103 },
    { subName: "Biochemical Engineering", url: "https://drive.google.com/drive/folders/11dO-FPMxESGbCUeKO9NV8SXOGBdm2Cgi?usp=sharing", sortOrder: 104 },
  ],
  "3": [
    { subName: "All QB", url: "https://drive.google.com/drive/folders/1nhPHYnDC1JZFl0TwaYxeFB2dbo8aGf9J", sortOrder: 0 },
    { subName: "QB 2021", url: "https://drive.google.com/drive/folders/1aMIGuCLJsTWPq9hm9F_KbaSiU9yxwvNm", sortOrder: 1 },
    { subName: "Knitting-II", url: "https://drive.google.com/drive/folders/10q4PsdhyUZlyGO8McbJoGF8mvkBVQI2u?usp=sharing", sortOrder: 100 },
    { subName: "TC-I", url: "https://drive.google.com/drive/folders/1Tg0ruIBuznlNWYGNYZVxGHnwu8UUNa2r", sortOrder: 101 },
    { subName: "CDP", url: "https://drive.google.com/drive/folders/1RQAbOpyuvqFSNgUBuDLJB5I51Tx5p8sV", sortOrder: 102 },
    { subName: "ACWP", url: "https://drive.google.com/drive/folders/1pCqxLyVgJ-BwhCpCtut7f6v9oQucaHzN", sortOrder: 103 },
    { subName: "AWDP", url: "https://drive.google.com/drive/folders/1l_xuqNbZyDC_aHw4MgHiRd_7FMMDra8v?usp=sharing", sortOrder: 104 },
    { subName: "ACYM", url: "https://drive.google.com/drive/folders/1c0nOFo78pJUI_Ja6iTRHonwUQnO1SnTL?usp=sharing", sortOrder: 105 },
    { subName: "ACAM", url: "https://drive.google.com/drive/folders/1Z1Xzjtc_9suoB12JBU0zoFud5y6pYC2k?usp=sharing", sortOrder: 106 },
    { subName: "ACTM", url: "https://drive.google.com/drive/folders/1Xn9FeVZIKi8eRz_LkE0gEt2FkzGalhRb?usp=sharing", sortOrder: 107 },
    { subName: "ACDCE", url: "https://drive.google.com/drive/folders/1ekFNG-qN4P-9fpnxnn0gdGrYsW-AC4UO?usp=sharing", sortOrder: 108 },
    { subName: "UM", url: "https://drive.google.com/drive/folders/1JtOZ552EnvWUX8RZ-5XA1WaQliujL-TV?usp=sharing", sortOrder: 109 },
    { subName: "CTPC", url: "https://drive.google.com/drive/folders/1VU_oIoVdv4ERdazfucJHUf7sKY4pW9s4?usp=sharing", sortOrder: 110 },
    { subName: "SYM", url: "https://drive.google.com/drive/folders/1632Rlb5rOPeQkKsGmO_VTxIEz6EY5OSY?usp=sharing", sortOrder: 111 },
    { subName: "ES(Environmental Studies)", url: "https://drive.google.com/drive/folders/1V_LjWmWR2DZ7SYKgmzk_s9SKezIkC7gh?usp=sharing", sortOrder: 112 },
    { subName: "FFTA(Fashion..)", url: "https://drive.google.com/drive/folders/1zozzpnNER_2F9VCbiP80A_tR-6QcTzwP?usp=sharing", sortOrder: 113 },
    { subName: "FMR(Fashion..)", url: "https://drive.google.com/drive/folders/1lJh8TwfpZ_wft_S3OVfVULEbsJX6zn8p?usp=sharing", sortOrder: 114 },
    { subName: "Special Clothing Materials", url: "https://drive.google.com/drive/folders/1SUb1uFAipbF8fwB7f-YiHUpm_duHt5So?usp=sharing", sortOrder: 115 },
    { subName: "CIAB", url: "https://drive.google.com/drive/folders/1dmMu64YUwiA6CN9iFVc7VRnosW8aAIh5?usp=sharing", sortOrder: 116 },
    { subName: "CC", url: "https://drive.google.com/drive/folders/11oHS9OXplYQfwCzNTwmNjNvFeMKUt3LC?usp=sharing", sortOrder: 117 },
  ],
  "4": [
    { subName: "\u{1F7E3} All about Comprehensive Viva!", url: "https://www.youtube.com/watch?v=qiI_w9YIpAY", sortOrder: 0 },
    { subName: "\u{1F7E3} Comprehensive Viva", url: "https://drive.google.com/drive/folders/1X3OIcJLAAc9maPhR0oUCK4smh-vA_mjG?usp=sharing", sortOrder: 1 },
    { subName: "\u{1F7E3} Comprehensive Viva Basic Questions", url: "https://drive.google.com/file/d/1oXg3sBJiZ5lTfUQLsFWUa4-385uS8yN4/view?usp=sharing", sortOrder: 2 },
    { subName: "\u{1F7E3} Industrial Attachment", url: "https://drive.google.com/drive/folders/1txN44rDdppKq77b2qi51-EqSf3DW5zwg?usp=sharing", sortOrder: 3 },
    { subName: "\u{1F7E3} Project Work/Thesis", url: "https://drive.google.com/drive/folders/1O3LQxlMBWrWTblO0LcsnnishsliMsu8h?usp=sharing", sortOrder: 4 },
    { subName: "\u{1F7E3} IPE(4-1)", url: "https://drive.google.com/drive/folders/1oH_OZZPFNhDJx6azfiHFOxpQ5iRmXVbp?usp=sharing", sortOrder: 5 },
    { subName: "\u{1F534} QB", url: "https://drive.google.com/drive/folders/1M9QjSqItJW1oZJd1RcG4yeAa41hB_dz-", sortOrder: 6 },
    { subName: "\u{1F534} QB-IPE(2022)", url: "https://drive.google.com/file/d/1h0QFixuMTYPzSVZjtckhYFGqX4QTnj8-/view?usp=sharing", sortOrder: 7 },
    { subName: "IE(Old Syl)", url: "https://drive.google.com/drive/folders/1qrbsRc4WWRKjCO3bqQDp0JK5S6Tvl6b6?usp=sharing", sortOrder: 8 },
    { subName: "Sociology", url: "https://drive.google.com/drive/folders/1dp46oYLKPp2Iruv0mM01uTCB-x0Hvn3r?usp=sharing", sortOrder: 9 },
    { subName: "IEAP", url: "https://drive.google.com/drive/folders/1YqLpLaP9KUMcnBsecumdwQ6hzOYLNsIQ?usp=sharing", sortOrder: 10 },
    { subName: "MRPD", url: "https://drive.google.com/drive/folders/1EC_kgYVyMgWezfg_8K1vGfYdY9M9GfNW?usp=sharing", sortOrder: 11 },
    { subName: "Project Development", url: "https://drive.google.com/drive/folders/1tEOihIpW3BqD1V3svkZwQ8x0zcnR6AFJ?usp=sharing", sortOrder: 12 },
    { subName: "Entrepreneurship", url: "https://drive.google.com/drive/folders/12mCadz9PEMlcjP5jMhXfcQTycv39vlWQ?usp=sharing", sortOrder: 13 },
    { subName: "BELE", url: "https://drive.google.com/drive/folders/12J2f98ba1ooCMq49kV10K810P0wbeuxw?usp=sharing", sortOrder: 14 },
    { subName: "TAM", url: "https://drive.google.com/drive/folders/1ePn1Q8xzepigVE1iujjMZ6H91_qCc3VH?usp=sharing", sortOrder: 15 },
    { subName: "FTQC", url: "https://drive.google.com/drive/folders/1r0fyyCs71xrAgvhqYZ4N4Tt8_rCkxP5E?usp=sharing", sortOrder: 16 },
    { subName: "TFT", url: "https://drive.google.com/drive/folders/1Th9_Pv1rfwtlC-o-uYFYxHGvsL-V93r1?usp=sharing", sortOrder: 17 },
    { subName: "SDC-II", url: "https://drive.google.com/drive/folders/1HgZ8tqEPGiLInSRenFox7x8F2-hNWrX5?usp=sharing", sortOrder: 18 },
    { subName: "BE", url: "https://drive.google.com/drive/folders/15t7jFvyddy2D6qH2R3gbMyWxuAkUBior?usp=sharing", sortOrder: 19 },
    { subName: "IA", url: "https://drive.google.com/drive/folders/1cgWwjWY8zeTmcSfElW96pAuqKRT7UPhj?usp=sharing", sortOrder: 20 },
    { subName: "Managerial Economics", url: "https://drive.google.com/drive/folders/1mRlKZyUP65B7iRwTMfhqdcXoIVRjFHex?usp=sharing", sortOrder: 21 },
    { subName: "WPE 405: Technical & Functional Textiles", url: "https://drive.google.com/drive/folders/1B8TcqI3FTWFzd3VTKDJrAnKelHu5CinS?usp=sharing", sortOrder: 22 },
  ],
};

// V1 lab subject slug → display name mapping (slug is what's stored in lab_reports.subject_slug)
const labSubjectNames: Record<string, Record<string, string>> = {
  "1": {
    che_1: "Chem-I", ap_1: "AP-I", che_2: "Chem-II", phy_1: "Phy-I", phy_2: "Phy-II",
    msp: "MSP", bce: "BCE", cp: "CP", ed: "ED",
  },
  "2": {
    am_1: "AM-I", wp_1: "WP-I", fm_1: "FM-I", ym_1: "YM-I", feee: "FEEE",
    ttqc: "TTQC", fme: "FME", mp: "MP", pm_1: "PM-I", sss_1: "SSS-I",
    sss_2: "SSS-II", wpp: "WPP", fe_wpp: "FE-204: WPP", sda: "SDA", fyt: "FYT",
  },
  "3": {
    am_2: "AM-II", wp_2: "WP-II", fm_2: "FM-II", ym_2: "YM-II", fsd: "FSD",
    acwp: "ACWP", ap_2: "AP-II", apparelWash: "Apparel Wash", eaic: "EAIC",
    pm_2: "PM-II", pm_3: "PM-III", mym: "MYM", mic: "MIC(New)", wpm_mach: "Wet Process Machinery",
  },
  "4": {
    mhmm: "MHMM", esm: "ESM", sfp: "SFP", kfa: "KFA", wvg2: "Weaving-II",
    wwmm: "WWMM", shwm: "SHWM", envModeling: "Environmental Modeling",
  },
};

// V1 lab slug → v1 route slug mapping (what the route uses vs what's in DB)
// In v1, /app/labs/1/chem1 but in DB it's subject_slug="che_1"
const labSlugMapping: Record<string, Record<string, string>> = {
  "1": {
    chem1: "che_1", ap1: "ap_1", chem2: "che_2", phy1: "phy_1", phy2: "phy_2",
    msp: "msp", bce: "bce", cp: "cp", ed: "ed",
  },
  "2": {
    am1: "am_1", wp1: "wp_1", fm1: "fm_1", ym1: "ym_1", feee: "feee",
    ttqc: "ttqc", fme: "fme", mp: "mp", pm1: "pm_1", sss1: "sss_1",
    sss2: "sss_2", wpp: "wpp", fe_wpp: "fe_wpp", sda: "sda", fyt: "fyt",
  },
  "3": {
    am2: "am_2", wp2: "wp_2", fm2: "fm_2", ym2: "ym_2", fsd: "fsd",
    acwp: "acwp", ap2: "ap_2", apparelWash: "apparelWash", eaic: "eaic",
    pm2: "pm_2", pm3: "pm_3", mym: "mym", mic: "mic", wpm_mach: "wpm_mach",
  },
  "4": {
    mhmm: "mhmm", esm: "esm", sfp: "sfp", kfa: "kfa", wvg2: "wvg2",
    wwmm: "wwmm", shwm: "shwm", envModeling: "envModeling",
  },
};

async function main() {
  const connStr = process.env.DATABASE_PUBLIC_URL;
  if (!connStr) {
    console.error("DATABASE_PUBLIC_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: connStr });

  // 1. Get level ID mapping
  const levelsResult = await pool.query("SELECT id, slug FROM levels ORDER BY sort_order");
  const levelMap: Record<string, number> = {};
  for (const row of levelsResult.rows) {
    levelMap[row.slug] = row.id;
  }
  console.log("Level map:", levelMap);

  // 2. Add direct-URL subjects
  let addedSubjects = 0;
  for (const [levelSlug, items] of Object.entries(directUrlSubjects)) {
    const levelId = levelMap[levelSlug];
    if (!levelId) {
      console.error(`  Level ${levelSlug} not found, skipping`);
      continue;
    }

    for (const item of items) {
      // Check if already exists
      const existing = await pool.query(
        `SELECT id FROM subjects WHERE level_id = $1 AND display_name = $2`,
        [levelId, item.subName]
      );

      if (existing.rows.length > 0) {
        // Update metadata
        await pool.query(
          `UPDATE subjects SET metadata = $1 WHERE id = $2`,
          [JSON.stringify({ directUrl: item.url }), existing.rows[0].id]
        );
        console.log(`  Updated existing: ${item.subName} (level ${levelSlug})`);
      } else {
        const slug = item.subName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_|_$/g, "");
        await pool.query(
          `INSERT INTO subjects (level_id, name, display_name, slug, sort_order, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [levelId, slug, item.subName, slug, item.sortOrder, JSON.stringify({ directUrl: item.url })]
        );
        addedSubjects++;
        console.log(`  Added: ${item.subName} (level ${levelSlug})`);
      }
    }
  }
  console.log(`\nAdded ${addedSubjects} direct-URL subjects`);

  // 3. Update lab_reports with display name metadata
  let updatedLabs = 0;
  for (const [levelSlug, mapping] of Object.entries(labSubjectNames)) {
    const levelId = levelMap[levelSlug];
    if (!levelId) continue;

    for (const [dbSlug, displayName] of Object.entries(mapping)) {
      const result = await pool.query(
        `UPDATE lab_reports
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $1
         WHERE level_id = $2 AND subject_slug = $3 AND (metadata IS NULL OR metadata->>'displayName' IS NULL)`,
        [JSON.stringify({ displayName, v1Slug: Object.entries(labSlugMapping[levelSlug] || {}).find(([, v]) => v === dbSlug)?.[0] || dbSlug }), levelId, dbSlug]
      );
      if (result.rowCount && result.rowCount > 0) {
        updatedLabs += result.rowCount;
      }
    }
  }
  console.log(`Updated ${updatedLabs} lab report rows with display names`);

  // 4. Create a lab_subject_mapping table or store in a config
  // Actually, let's store the lab subject mappings as a JSON in a simple config row.
  // Better: add it to level metadata
  for (const [levelSlug, mapping] of Object.entries(labSubjectNames)) {
    const levelId = levelMap[levelSlug];
    if (!levelId) continue;

    const slugMap = labSlugMapping[levelSlug] || {};
    const labConfig = {
      labSubjects: Object.entries(mapping).map(([dbSlug, displayName]) => ({
        dbSlug,
        displayName,
        v1RouteSlug: Object.entries(slugMap).find(([, v]) => v === dbSlug)?.[0] || dbSlug,
      })),
    };

    await pool.query(
      `UPDATE levels SET metadata = COALESCE(metadata, '{}'::jsonb) || $1 WHERE id = $2`,
      [JSON.stringify(labConfig), levelId]
    );
    console.log(`Updated level ${levelSlug} with lab subject config`);
  }

  await pool.end();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
