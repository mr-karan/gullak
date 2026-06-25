// Thin wrapper over the Google Sheets v4 values REST API. Just the three
// operations the expense push needs: read a range, overwrite a range, and
// append rows.

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

async function check(res: Response, what: string): Promise<unknown> {
  if (!res.ok) {
    throw new Error(`sheets ${what} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getValues(
  token: string,
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const res = await fetch(
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const json = (await check(res, "get")) as { values?: string[][] };
  return json.values ?? [];
}

export async function updateValues(
  token: string,
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
): Promise<void> {
  const res = await fetch(
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );
  await check(res, "update");
}

export async function appendValues(
  token: string,
  spreadsheetId: string,
  range: string,
  values: (string | number)[][],
): Promise<void> {
  const res = await fetch(
    `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values }),
    },
  );
  await check(res, "append");
}
