/**
 * Hardcoded syllabus data migrated from v1 engine.
 * No DB table exists for this — data is static Google Drive links.
 */

type SyllabusBatch = { batch: string; route: string };
type SyllabusDept = { dept: string; route: string };
type SyllabusTopic = { topic: string; url: string };

const batches: SyllabusBatch[] = [
  { batch: "45", route: "app/syllabus/45" },
  { batch: "46", route: "app/syllabus/46" },
];

const batch45Depts: SyllabusDept[] = [
  { dept: "AE", route: "app/syllabus/45/ae" },
  { dept: "YE", route: "app/syllabus/45/ye" },
  { dept: "FE", route: "app/syllabus/45/fe" },
  { dept: "IPE", route: "app/syllabus/45/ipe" },
  { dept: "WPE", route: "app/syllabus/45/wpe" },
  { dept: "TEM", route: "app/syllabus/45/tem" },
  { dept: "DCE", route: "app/syllabus/45/dce" },
  { dept: "TFD", route: "app/syllabus/45/tfd" },
  { dept: "TMDM", route: "app/syllabus/45/tmdm" },
  { dept: "ESE", route: "app/syllabus/45/ese" },
];

const batch46Depts: SyllabusDept[] = [
  { dept: "All", route: "app/syllabus/46/all" },
];

const deptTopics: Record<string, Record<string, SyllabusTopic[]>> = {
  "45": {
    ae: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1MncnGSZjCFeDW4rj4atEUGQ45YCoj6Xk/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/1L-sekRiA0CP3WuOHiBRp0tQ2jqWpyyaA/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/1-OaK1JxCIjj2ivGq3Rrh3ewTlgrZoF5d/view" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/1710DObmZ5xtEG89rP4und4gXj9a939bf/view" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1pzROBC9emUvOtVCVTW7aRcHcBsITpno7/view" },
      { topic: "L 3,2", url: "https://drive.google.com/file/d/117wp4kXbw7zSy2JRM5ZGGmmAq5Egb4aC/view" },
      { topic: "L 4,1", url: "https://drive.google.com/file/d/1oFfI3wCK9YKwNKhXdM8A9cah2CscQ89T/view" },
      { topic: "L 4,2", url: "https://drive.google.com/file/d/1Shb2GaIAbaWaR4xhlflCFBsDumWrV8r2/view" },
    ],
    ye: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1eDndQhSYqdytgi6aHtGG9PnSWEF5ifWX/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/1njQ8SshIftzAOwDjgLFYz1lByQfqvhR8/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/16CoiVNHeEOgUzeA7w9vYPh6K5PWxSrvb/view" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/1geeoR4KcO0wtsw6cMRDgSEtz_8NmLGew/view" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1m2OscEYeA2_2O7rTfSqhFybjSys2uQia/view" },
      { topic: "L 3,2", url: "https://drive.google.com/file/d/1XG7L4nu8TfZodNol5Cxd7x_j5yjQ5DBH/view" },
      { topic: "L 4,1", url: "https://drive.google.com/file/d/13CuUYK_9Qrvy3_A8KuJriHQjXcBnhU2Q/view" },
      { topic: "L 4,2", url: "https://drive.google.com/file/d/1e5ExWn4c4EjqG2aZFOZc73MXNwzN7wJE/view" },
    ],
    fe: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1O5BB6yMCnA9XBp57uyCF4s1hzGoDvzAN/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/173EUX3cHGC0V-Siegq1R6JBfMviRvVbp/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/1A6dHUlyQf4Qq4KX7zCs4Pk3k2Eevu_2G/view" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/1KmCxfznOS20t9pIzQPyBtHknqqof0pUl/view" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1mK7IG8pT-9mTduo9owe2KmKymf4bo1dn/view" },
      { topic: "L 3,2", url: "https://triptoafsin.github.io/sample-default-pages/willBeSoonAvailable.html" },
      { topic: "L 4,1", url: "https://triptoafsin.github.io/sample-default-pages/willBeSoonAvailable.html" },
      { topic: "L 4,2", url: "https://triptoafsin.github.io/sample-default-pages/willBeSoonAvailable.html" },
    ],
    ipe: [
      { topic: "Course Outline", url: "https://drive.google.com/file/d/1IxKsBIK6pblnbU7f_6XFWmXssqMVDtIO/view" },
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1muXlioor1tOFCZG2x6LNx5TEt-blRYAg/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/17QSqxeIY4yYO_sJWn22BSDu2dFEhvV82/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/1hOxZb5F_DG0O0g9w4ch0P3ryXze-2Gvt/view" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/1NSqYazzsCzJ7pjicctDsUPKa1HsuhCl7/view" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1eLjnreLz71_n6Sn8IJKffNrr5Jqritlo/view" },
      { topic: "L 3,2", url: "https://drive.google.com/file/d/1zGg4b6NqePEFMBm7cVTZ5wrIycT0eK5v/view" },
      { topic: "L 4,1", url: "https://drive.google.com/file/d/1aW_My0_KJkpMNgY3AG376YaZQcgCiUC0/view" },
      { topic: "L 4,2", url: "https://drive.google.com/file/d/124uyTsGyN10lBDwKxTnW9yECY9OWo8aL/view" },
    ],
    wpe: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1mIXBLRpourGN1f7gdSKSAnWzsmvBF-gx/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/1eMnAIeA_Kdypj6iGyZJOmp2_9ikbOQEh/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/1UO-sGBTgSV878mUNBOAVj9VnC1HnHj_2/view" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/19_R61uRsV-bVTmqRR1XgwIhzO65K9d-r/view" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1wkAFnn4BHJB3PS5FDsVTvRHqvCZZv_xU/view" },
      { topic: "L 3,2", url: "https://drive.google.com/file/d/1OwuY-5f4LLLq0ZJ3_Y8mJsSYsxE0ycuh/view?usp=sharing" },
      { topic: "L 4,1", url: "https://drive.google.com/file/d/1kH-pbcC7k00igdw-V8ZQDCA1Ex5Avn8-/view" },
      { topic: "L 4,2", url: "https://drive.google.com/file/d/1Z4gfIBSEhWA0Jq2-1USRfeeF_cOsgcRn/view" },
    ],
    tem: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1RuQRHQR7-83quVR894ICWvWPOxKoHB-w/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/1wtx9QehPgoFC779LFLKAWI93V2EZ_-zm/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/18Hv8H6nOsFshr5WU6k9hd_h3Sup9ALBn/view" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/1ZGUTVvlqy20dveB4YqW-a6rYbcXmrvFO/view" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1E0SLhOFJoe9yNa9GMOqBlvD7qgLmP3Fk/view" },
      { topic: "L 3,2", url: "https://drive.google.com/file/d/1YATteaW6hmQGe29Avu9oS_h4sec9GPPQ/view" },
      { topic: "L 4,1", url: "https://drive.google.com/file/d/1T077V6tjz09ByqX9zcURil_ADPwlWgpj/view" },
      { topic: "L 4,2", url: "https://drive.google.com/file/d/1hrwRBZgPH6d4XgrraTU6OFfGWEKaw6JO/view" },
    ],
    dce: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1Np9iViffVrG3Y7wXH4GXoz4J7zxyUtlB/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/1QGGBzivE0xSxL42JdCgUtEOacUzb7USd/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/1dgMemARdQn5DOm607kJSL1sXpML2i7Nu/view" },
      { topic: "L 2,2", url: "https://triptoafsin.github.io/sample-default-pages/willBeSoonAvailable.html" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1dwduNPeuezE90AfRtB2FPyyohkfWMhXR/view" },
      { topic: "L 3,2", url: "https://triptoafsin.github.io/sample-default-pages/willBeSoonAvailable.html" },
      { topic: "L 4,1", url: "https://triptoafsin.github.io/sample-default-pages/willBeSoonAvailable.html" },
      { topic: "L 4,2", url: "https://triptoafsin.github.io/sample-default-pages/willBeSoonAvailable.html" },
    ],
    tfd: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1foBzDjChNz2k9qhis5vmm6Ezae5rMz9H/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/1kqw1s9k46bYq5CPYEjB0hwWP6GEkAqfB/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/1zl9t1Cv_Gr2PDg-vr12tU2eD3gYzNTA-/view" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/151LU21z_wiL-aYgvpP-hBJF55BGOm3hA/view" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1_y6St7PdOSzbGxlEbX9yzG9zoi_0LHAH/view" },
      { topic: "L 3,2", url: "https://drive.google.com/file/d/1M-AJ4Gmqfv6dBhBZnea9N2jjDV1Fd7zT/view" },
      { topic: "L 4,1", url: "https://drive.google.com/file/d/1C_epjMv-yiu7Ex5NCG8iEZuJCu9JTGap/view" },
      { topic: "L 4,2", url: "https://drive.google.com/file/d/1yzi_Lgj7i2oHFDgMZMwn0w3gs7hX3g7U/view" },
    ],
    tmdm: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/0B-DAyRDeIvuSXy1XeTg5QjV5aG9yY3VXLU9GRzlwbVY5RE5F/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/0B-DAyRDeIvuSXy1XeTg5QjV5aG9yY3VXLU9GRzlwbVY5RE5F/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/1AynxvXu1-9Qs6sEII7T8yXCcrf8g-ePT/view?usp=sharing" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/1B-uDSwg3lqamJ3OrWp4PjT7gFpnz1tFG/view?usp=sharing" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1AxPvKoB_y6pYgt3EKV8GMaZgIgQ9C4ee/view?usp=sharing" },
      { topic: "L 3,2", url: "https://drive.google.com/file/d/1Aulrho3j5M94Tnal9JZVZSDOV2XPD1-3/view?usp=sharing" },
      { topic: "L 4,1", url: "https://drive.google.com/file/d/1bfBLOj1rzE2ReIwc_Eq9_JMRqgnZTE1Z/view?usp=sharing" },
      { topic: "L 4,2", url: "https://drive.google.com/file/d/1kG5NuyACxjvUnvp_DasmaESZy6hM_RwW/view?usp=sharing" },
    ],
    ese: [
      { topic: "L 1,1", url: "https://drive.google.com/file/d/1k6sDYnh7ko5VLtvhNP1QvO_0DdLqTdUz/view" },
      { topic: "L 1,2", url: "https://drive.google.com/file/d/1ZtCaCVTyOsHRchmI_txuybFhYcHqBqYN/view" },
      { topic: "L 2,1", url: "https://drive.google.com/file/d/1pxKgdj1njWvJGSku8PI1ZM1qh0LsGpBG/view" },
      { topic: "L 2,2", url: "https://drive.google.com/file/d/1lFCpkdXm4i1yyjxDgKuEigQXUxAK-nwM/view" },
      { topic: "L 3,1", url: "https://drive.google.com/file/d/1oUUwG8k7HhE0CScdTbqIzT4pLDDehgdB/view" },
      { topic: "L 3,2", url: "https://drive.google.com/file/d/1JuBcpTjZkNqubPccKx7kq0syjsB2eXWW/view" },
      { topic: "L 4,1", url: "https://drive.google.com/file/d/1gmCPlG3x0vE0ZYPq1s94MxaH6iXThZGo/view" },
      { topic: "L 4,2", url: "https://drive.google.com/file/d/1ZaHwtNIIchuY0reWUajIrreKtt8diHAA/view" },
    ],
  },
  "46": {
    all: [
      { topic: "Download", url: "https://drive.google.com/file/d/1MncnGSZjCFeDW4rj4atEUGQ45YCoj6Xk/view" },
    ],
  },
};

export const syllabusService = {
  getBatches(): SyllabusBatch[] {
    return batches;
  },

  getDepts(batch: string): SyllabusDept[] | null {
    if (batch === "45") return batch45Depts;
    if (batch === "46") return batch46Depts;
    return null;
  },

  getTopics(batch: string, dept: string): SyllabusTopic[] | SyllabusTopic | null {
    const batchData = deptTopics[batch];
    if (!batchData) return null;

    const topics = batchData[dept.toLowerCase()];
    if (!topics) return null;

    // Batch 46/all returns a single object (matching v1 behavior)
    if (batch === "46" && dept.toLowerCase() === "all" && topics.length === 1) {
      return topics[0];
    }

    return topics;
  },
};
