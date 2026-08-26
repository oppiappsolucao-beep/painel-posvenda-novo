import { google } from "googleapis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const sheetId = process.argv[2] || process.env.SHEET_ID || "1TTrjf0DZxWkIacYTp7_vcRmTx2-8XrobIaPgIflnyG8";
const sheetTab = process.argv[3] || process.env.SHEET_TAB || "Folha1";

const auth = new google.auth.JWT({
  email: process.env.GCP_CLIENT_EMAIL,
  key: (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

const res = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: `'${sheetTab}'!A:ZZ`,
});

const values = res.data.values || [];
if (values.length <= 1) {
  console.log(JSON.stringify([]));
  process.exit(0);
}

const headers = values[0].map((h) => String(h).replace(/\u00a0/g, " ").trim());
const rows = [];

for (let i = 1; i < values.length; i++) {
  const rowValues = values[i];
  const row = {};
  headers.forEach((h, idx) => {
    row[h] = rowValues[idx] ?? "";
  });
  rows.push(row);
}

console.log(JSON.stringify(rows));
