const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUILDINGS_PATH = path.join(ROOT, "public/data/geojson/songpa_buildings.geojson");
const EXPORT_BUILDINGS_PATH = path.join(ROOT, "exports/geojson/songpa_buildings.geojson");
const PARCELS_PATH = path.join(ROOT, "public/data/geojson/songpa_cadastral.geojson");
const REGISTER_PATH = path.join(
  ROOT,
  "processed/building-register/songpa_building_register_pyojebu.csv",
);
const STATS_PATH = path.join(ROOT, "public/data/stats/songpa_building_usage_stats.json");

const CATEGORY_COLORS = {
  "02000": "#f3a64f",
  "01000": "#4e66d8",
  "04000": "#d66bc7",
  "03000": "#95d36d",
  "14000": "#7e7cf4",
  "10000": "#f1dd63",
  "11000": "#7bc6f6",
  "20000": "#8ea1b5",
  "06000": "#c48ef3",
  "07000": "#ff8d63",
  "15000": "#6ac7ba",
  "09000": "#c7a167",
  default: "#9a7b68",
};

function parseCsv(content) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((item) => item !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function toRecord(headers, row) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
}

function toNumber(value) {
  const number = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatDate(value) {
  if (!/^\d{8}$/.test(value || "")) {
    return "";
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function buildPnu(record) {
  const landType = record["대지구분코드"] === "1" ? "2" : "1";
  return [
    record["시군구코드"],
    record["법정동코드"],
    landType,
    record["번"],
    record["지"],
  ].join("");
}

function buildLotNumber(record) {
  const main = String(record["번"] || "").replace(/^0+/, "") || "0";
  const sub = String(record["지"] || "").replace(/^0+/, "");
  return sub && sub !== "0" ? `${main}-${sub}` : main;
}

function cloneGeometry(geometry) {
  return JSON.parse(JSON.stringify(geometry));
}

function summarizeStats(features, totalParcels, totalDongs) {
  const usageCodeMap = {};
  const groups = new Map();
  let totalGrossFloorArea = 0;

  for (const feature of features) {
    const props = feature.properties || {};
    const code = props.A8 || "unknown";
    const name = props.A9 || "미분류";
    const grossFloorArea = toNumber(props.A14);

    totalGrossFloorArea += grossFloorArea;
    usageCodeMap[code] = name;

    if (!groups.has(code)) {
      groups.set(code, {
        code,
        name,
        count: 0,
        totalGrossFloorArea: 0,
        ratio: 0,
        color: CATEGORY_COLORS[code] || CATEGORY_COLORS.default,
      });
    }

    const group = groups.get(code);
    group.count += 1;
    group.totalGrossFloorArea += grossFloorArea;
  }

  const usageStats = [...groups.values()]
    .map((item) => ({
      ...item,
      totalGrossFloorArea: Number(item.totalGrossFloorArea.toFixed(2)),
      ratio: Number((item.count / features.length).toFixed(6)),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalBuildings: features.length,
    totalGrossFloorArea: Number(totalGrossFloorArea.toFixed(2)),
    totalParcels,
    totalDongs,
    usageCodeMap,
    usageStats,
  };
}

const buildings = JSON.parse(fs.readFileSync(BUILDINGS_PATH, "utf8"));
buildings.features = buildings.features.filter(
  (feature) => feature.properties?.source !== "building-register",
);
const parcels = JSON.parse(fs.readFileSync(PARCELS_PATH, "utf8"));
const previousStats = JSON.parse(fs.readFileSync(STATS_PATH, "utf8"));
const csvRows = parseCsv(fs.readFileSync(REGISTER_PATH, "utf8"));
const headers = csvRows.shift();
headers[0] = headers[0].replace(/^\uFEFF/, "");
const registerRecords = csvRows.map((row) => toRecord(headers, row));
const usageNameByCode = new Map();

for (const record of registerRecords) {
  const code = record["주용도코드"];
  const name = record["주용도코드명"];
  if (code && name && !usageNameByCode.has(code)) {
    usageNameByCode.set(code, name);
  }
}

for (const feature of buildings.features) {
  const usageCode = feature.properties?.A8;
  if (usageNameByCode.has(usageCode)) {
    feature.properties.A9 = usageNameByCode.get(usageCode);
  }
}

const parcelByPnu = new Map(parcels.features.map((feature) => [feature.properties.A1, feature]));
const integratedPnus = new Set(buildings.features.map((feature) => feature.properties.A2));
const existingRegisterKeys = new Set(
  buildings.features
    .map((feature) => feature.properties?.registerPk)
    .filter(Boolean),
);

let added = 0;
let skippedExistingPnu = 0;
let skippedNoParcel = 0;
let skippedDuplicateRegister = 0;

for (const record of registerRecords) {
  const pnu = buildPnu(record);
  const registerPk = record["관리건축물대장PK"];

  if (integratedPnus.has(pnu)) {
    skippedExistingPnu += 1;
    continue;
  }

  if (existingRegisterKeys.has(registerPk)) {
    skippedDuplicateRegister += 1;
    continue;
  }

  const parcel = parcelByPnu.get(pnu);
  if (!parcel) {
    skippedNoParcel += 1;
    continue;
  }

  buildings.features.push({
    type: "Feature",
    geometry: cloneGeometry(parcel.geometry),
    properties: {
      A0: `BR-${registerPk}`,
      A1: registerPk,
      A2: pnu,
      A3: `${record["시군구코드"]}${record["법정동코드"]}`,
      A4: record["대지위치"],
      A5: buildLotNumber(record),
      A6: record["대지구분코드"],
      A7: record["주부속구분코드명"],
      A8: record["주용도코드"],
      A9: record["주용도코드명"],
      A10: record["구조코드"],
      A11: record["구조코드명"] || record["기타구조"],
      A12: toNumber(record["건축면적(㎡)"]),
      A13: formatDate(record["사용승인일"]),
      A14: toNumber(record["연면적(㎡)"]),
      A15: toNumber(record["대지면적(㎡)"]),
      A16: toNumber(record["건폐율(%)"]),
      A17: toNumber(record["용적률(%)"]),
      A18: toNumber(record["용적률산정연면적(㎡)"]),
      A19: record["새주소도로코드"],
      A20: record["내진설계적용여부"],
      A21: registerPk,
      A22: formatDate(record["생성일자"]),
      A23: record["시군구코드"],
      A24: record["건물명"],
      A25: record["동명칭"],
      A26: toNumber(record["지상층수"]),
      A27: toNumber(record["지하층수"]),
      A28: formatDate(record["생성일자"]),
      source: "building-register",
      geometrySource: "parcel",
      registerPk,
      parcelPnu: pnu,
    },
  });

  existingRegisterKeys.add(registerPk);
  added += 1;
}

const stats = summarizeStats(
  buildings.features,
  parcels.features.length,
  previousStats.totalDongs || 0,
);

fs.writeFileSync(BUILDINGS_PATH, JSON.stringify(buildings));
fs.writeFileSync(EXPORT_BUILDINGS_PATH, JSON.stringify(buildings));
fs.writeFileSync(STATS_PATH, JSON.stringify(stats));

console.log(
  JSON.stringify(
    {
      added,
      totalBuildings: buildings.features.length,
      skippedExistingPnu,
      skippedNoParcel,
      skippedDuplicateRegister,
    },
    null,
    2,
  ),
);
