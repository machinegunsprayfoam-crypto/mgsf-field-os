// Klyfton "Spray Window" — go/no-go spray conditions tied to a job address.
// FREE, no API key: US Census geocoder (address -> lat/lon) + NWS api.weather.gov
// (hourly forecast). Runs as a Vercel serverless function (Node 18+ global fetch).
//
// POST { address } OR { lat, lon }  ->  { ok, location, days[], next24[], disclaimer }
// Each day/hour carries a GO / CAUTION / NO-GO flag from the raw numbers. The flags are
// CONSERVATIVE general SPF/coatings guidance — always verify against the product data
// sheet and substrate temp on site. NWS covers the US only (fine for MT/WY/ND/SD).

const UA = "MachineGunSprayFoam-FieldOS (machinegunsprayfoam@gmail.com)"; // NWS requires a User-Agent

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length) { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let d = ""; req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

// Address -> {lat, lon, matched} via the free US Census geocoder (no key, US only).
async function geocode(address) {
  const url = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=" +
    encodeURIComponent(address) + "&benchmark=Public_AR_Current&format=json";
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("geocode_http_" + r.status);
  const j = await r.json();
  const m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
  if (!m || !m.coordinates) throw new Error("address_not_found");
  return { lat: m.coordinates.y, lon: m.coordinates.x, matched: m.matchedAddress };
}

async function nwsGet(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/geo+json" } });
  if (!r.ok) throw new Error("nws_http_" + r.status);
  return r.json();
}

const cToF = (c) => (c == null ? null : c * 9 / 5 + 32);
// NWS windSpeed is a string like "10 mph" or "5 to 10 mph" — take the higher number.
function parseWind(s) {
  if (s == null) return null;
  const nums = String(s).match(/\d+/g);
  if (!nums) return null;
  return Math.max.apply(null, nums.map(Number));
}

// Conservative spray assessment from one hour's numbers. Returns { level, reasons }.
// Dew-point rule: surface must sit >=5°F above dew point or you risk condensation under the foam.
function assessHour(h) {
  const order = { GO: 0, CAUTION: 1, NOGO: 2 };
  let level = "GO";
  const reasons = [];
  const bump = (l, why) => { if (order[l] > order[level]) level = l; reasons.push(why); };

  if (h.pop != null) {
    if (h.pop >= 50) bump("NOGO", "rain " + h.pop + "%");
    else if (h.pop >= 25) bump("CAUTION", "rain " + h.pop + "%");
  }
  if (h.temp != null) {
    if (h.temp < 35) bump("NOGO", "cold " + Math.round(h.temp) + "°F");
    else if (h.temp < 45) bump("CAUTION", "cool " + Math.round(h.temp) + "°F");
    else if (h.temp > 100) bump("CAUTION", "hot " + Math.round(h.temp) + "°F");
  }
  if (h.temp != null && h.dewpoint != null) {
    const spread = h.temp - h.dewpoint;
    if (spread < 5) bump("NOGO", "dew-point spread " + Math.round(spread) + "°F — condensation risk");
    else if (spread < 8) bump("CAUTION", "tight dew spread " + Math.round(spread) + "°F");
  }
  if (h.wind != null) {
    if (h.wind > 20) bump("NOGO", "wind " + Math.round(h.wind) + " mph — overspray");
    else if (h.wind > 15) bump("CAUTION", "wind " + Math.round(h.wind) + " mph");
  }
  return { level, reasons };
}

const worst = (a, b) => (({ GO: 0, CAUTION: 1, NOGO: 2 })[b] > ({ GO: 0, CAUTION: 1, NOGO: 2 })[a] ? b : a);
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

module.exports = async (req, res) => {
  if (req.method !== "POST") { sendJson(res, 405, { ok: false, error: "method_not_allowed" }); return; }
  const body = await readBody(req);

  try {
    // 1) Resolve coordinates.
    let lat = Number(body.lat), lon = Number(body.lon), matched = null;
    if (!isFinite(lat) || !isFinite(lon)) {
      const addr = String((body && body.address) || "").trim();
      if (!addr) { sendJson(res, 400, { ok: false, error: "no_address" }); return; }
      const g = await geocode(addr);
      lat = g.lat; lon = g.lon; matched = g.matched;
    }

    // 2) NWS: points -> hourly forecast URL -> hourly periods.
    const pts = await nwsGet("https://api.weather.gov/points/" + lat.toFixed(4) + "," + lon.toFixed(4));
    const hourlyUrl = pts && pts.properties && pts.properties.forecastHourly;
    const rel = pts && pts.properties && pts.properties.relativeLocation && pts.properties.relativeLocation.properties;
    if (!hourlyUrl) throw new Error("no_forecast_for_location");
    const fc = await nwsGet(hourlyUrl);
    const periods = (fc && fc.properties && fc.properties.periods) || [];
    if (!periods.length) throw new Error("empty_forecast");

    // 3) Normalize each hour + assess.
    const hours = periods.map((p) => {
      const temp = p.temperatureUnit === "F" ? p.temperature : cToF(p.temperature);
      const dew = p.dewpoint && p.dewpoint.value != null ? cToF(p.dewpoint.value) : null;
      const rh = p.relativeHumidity && p.relativeHumidity.value != null ? p.relativeHumidity.value : null;
      const pop = p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value != null ? p.probabilityOfPrecipitation.value : 0;
      const wind = parseWind(p.windSpeed);
      const h = { time: p.startTime, temp, dewpoint: dew, rh, wind, pop };
      const a = assessHour(h);
      h.level = a.level; h.reasons = a.reasons;
      h.date = String(p.startTime).slice(0, 10);
      h.hour = parseInt(String(p.startTime).slice(11, 13), 10);
      return h;
    });

    // 4) Next 24 hours (compact).
    const next24 = hours.slice(0, 24).map((h) => ({
      time: h.time, temp: h.temp == null ? null : Math.round(h.temp),
      dewpoint: h.dewpoint == null ? null : Math.round(h.dewpoint),
      rh: h.rh, wind: h.wind, pop: h.pop, level: h.level, reasons: h.reasons,
    }));

    // 5) Daily rollup — assess working daylight hours (6am–6pm), report hi/lo across the day.
    const byDate = {};
    hours.forEach((h) => {
      const d = (byDate[h.date] = byDate[h.date] || { date: h.date, temps: [], winds: [], pops: [], spreads: [], level: "GO", reasons: {} });
      if (h.temp != null) d.temps.push(h.temp);
      if (h.wind != null) d.winds.push(h.wind);
      if (h.pop != null) d.pops.push(h.pop);
      if (h.temp != null && h.dewpoint != null) d.spreads.push(h.temp - h.dewpoint);
      if (h.hour >= 6 && h.hour <= 18) { // only working hours drive the go/no-go
        d.level = worst(d.level, h.level);
        (h.reasons || []).forEach((r) => { const k = r.replace(/\s*\d+.*$/, "").trim() || r; d.reasons[k] = r; });
      }
    });
    const days = Object.keys(byDate).sort().slice(0, 7).map((k) => {
      const d = byDate[k];
      const dt = new Date(k + "T12:00:00");
      const isSun = dt.getUTCDay() === 0;
      return {
        date: k,
        label: DOW[dt.getUTCDay()],
        sunday: isSun,
        level: isSun ? "NOGO" : d.level, // company rule: never spray Sundays
        tempHi: d.temps.length ? Math.round(Math.max.apply(null, d.temps)) : null,
        tempLo: d.temps.length ? Math.round(Math.min.apply(null, d.temps)) : null,
        maxWind: d.winds.length ? Math.round(Math.max.apply(null, d.winds)) : null,
        maxPop: d.pops.length ? Math.max.apply(null, d.pops) : null,
        minDewSpread: d.spreads.length ? Math.round(Math.min.apply(null, d.spreads)) : null,
        reasons: isSun ? ["Sunday — no work scheduled"] : Object.values(d.reasons),
      };
    });

    sendJson(res, 200, {
      ok: true,
      location: { matched: matched || (rel ? (rel.city + ", " + rel.state) : null), lat, lon, city: rel ? rel.city : null, state: rel ? rel.state : null },
      generatedAt: fc.properties.generatedAt || null,
      days,
      next24,
      disclaimer: "Conservative general guidance from NWS forecast numbers — verify against the product data sheet and measure substrate temp on site before spraying.",
    });
  } catch (e) {
    const msg = String((e && e.message) || e);
    const status = msg === "address_not_found" || msg === "no_address" ? 200 : 200;
    sendJson(res, status, { ok: false, error: msg });
  }
};
