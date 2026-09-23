// rapid-handler — address geocoding and satellite roof measurement for the
// roofing estimator (embed/roofing.html, and the marketing carousel).
//
//   POST { address }     -> { geocoded, lat, lng, formatted, state }
//   POST { lat, lng }    -> { found, totalAreaSqft, avgPitchDegrees, segments,
//                             centerLat, centerLng, roof }
//
// totalAreaSqft is Google Solar's wholeRoofStats.areaMeters2: the SLOPED
// surface of the roof, the number shingles are ordered against — not the
// footprint.
//
// `roof` is what lets the estimator draw the homeowner's own roof rather than
// a generic one: every roof plane Solar found, with its slope, the compass
// direction it faces, its height and where it sits. The estimator turns those
// into a white-block model; an older estimator ignores the field.
//
// Deploy:  supabase functions deploy rapid-handler --no-verify-jwt
// Secrets: GOOGLE_MAPS_KEY, GOOGLE_SOLAR_KEY

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SQFT = 10.7639;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;   // ~10 cm, plenty for a sketch

// A dormer or a chimney cap is a real plane but noise in a picture of the
// house, and a warehouse can have hundreds. The model keeps the planes that
// carry the shape.
const MIN_PLANE_M2 = 2;
const MAX_PLANES = 24;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();

    // ---- Branch 1: geocode an address -> precise coordinates ----
    if (body.address) {
      const mapsKey = Deno.env.get("GOOGLE_MAPS_KEY");
      const gurl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(body.address)}&region=us&key=${mapsKey}`;
      const gr = await fetch(gurl);
      const gd = await gr.json();
      if (gd.status === "OK" && gd.results?.[0]) {
        const r0 = gd.results[0];
        const loc = r0.geometry.location;
        let state = "";
        for (const c of (r0.address_components || [])) {
          if (c.types.includes("administrative_area_level_1")) state = c.short_name;
        }
        return json({ geocoded: true, lat: loc.lat, lng: loc.lng, formatted: r0.formatted_address, state });
      }
      return json({ geocoded: false });
    }

    // ---- Branch 2: measure the roof from coordinates ----
    const { lat, lng } = body;
    const key = Deno.env.get("GOOGLE_SOLAR_KEY");
    const url = `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&requiredQuality=BASE&key=${key}`;
    const r = await fetch(url);
    if (!r.ok) return json({ found: false });

    const data = await r.json();
    const sp = data.solarPotential || {};
    const totalM2 = sp.wholeRoofStats?.areaMeters2 || 0;
    const segs = sp.roofSegmentStats || [];
    let wSum = 0, aSum = 0;
    for (const s of segs) {
      wSum += (s.pitchDegrees || 0) * (s.stats?.areaMeters2 || 0);
      aSum += (s.stats?.areaMeters2 || 0);
    }
    const avgPitchDeg = aSum > 0 ? wSum / aSum : 0;

    // every plane worth drawing, largest first
    const planes = segs
      .filter((s: any) => (s.stats?.groundAreaMeters2 || 0) >= MIN_PLANE_M2 && s.center && s.boundingBox)
      .sort((a: any, b: any) => (b.stats?.groundAreaMeters2 || 0) - (a.stats?.groundAreaMeters2 || 0))
      .slice(0, MAX_PLANES)
      .map((s: any) => ({
        pitch: r1(s.pitchDegrees || 0),
        azimuth: r1(s.azimuthDegrees || 0),            // compass direction the plane faces
        areaSqft: Math.round((s.stats?.areaMeters2 || 0) * SQFT),
        groundSqft: Math.round((s.stats?.groundAreaMeters2 || 0) * SQFT),
        lat: r6(s.center.latitude), lng: r6(s.center.longitude),
        h: r1(s.planeHeightAtCenterMeters || 0),      // metres above sea level
        sw: [r6(s.boundingBox.sw.latitude), r6(s.boundingBox.sw.longitude)],
        ne: [r6(s.boundingBox.ne.latitude), r6(s.boundingBox.ne.longitude)],
      }));

    return json({
      found: totalM2 > 0,
      totalAreaSqft: Math.round(totalM2 * SQFT),
      avgPitchDegrees: Math.round(avgPitchDeg * 10) / 10,
      segments: segs.length,
      centerLat: data.center?.latitude || null,
      centerLng: data.center?.longitude || null,
      roof: planes.length ? { planes } : null,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
