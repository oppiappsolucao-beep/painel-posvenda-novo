import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const auth = new google.auth.JWT({
    email: process.env.GCP_CLIENT_EMAIL,
    key: (process.env.GCP_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  console.log("Service account:", process.env.GCP_CLIENT_EMAIL);

  const list = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: "files(id, name)",
    pageSize: 20,
  });
  console.log("Planilhas acessíveis:");
  for (const f of list.data.files || []) {
    console.log(` - ${f.name} | ${f.id}`);
  }

  const target = (list.data.files || []).find((f) =>
    f.name?.toLowerCase().includes("skoob"),
  );
  if (!target?.id) {
    console.log("Nenhuma planilha Skoob encontrada para esta service account.");
    return;
  }

  console.log("\nUsando:", target.name, target.id);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: target.id });
  console.log("tabs:", meta.data.sheets?.map((s) => s.properties?.title));

  for (const tab of meta.data.sheets || []) {
    const title = tab.properties?.title;
    if (!title) continue;
    const r = await sheets.spreadsheets.values.get({
      spreadsheetId: target.id,
      range: `'${title}'!A1:J3`,
    });
    console.log(`Amostra [${title}]:`, r.data.values);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
