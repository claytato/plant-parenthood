// Cloudflare Pages Function: POST /api/sitter-guide
// Body: { plants: [...], visit_date: "2026-05-20", today: "2026-05-13" }
// Returns: { briefs: [{ id: "plant-...", brief: "..." }, ...] }

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const onRequestPost = async (context) => {
  const apiKey = context.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "ANTHROPIC_API_KEY is not configured on the server" }, 500);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const plants = body.plants;
  const visitDate = body.visit_date || "(not set)";
  const today = body.today || "(not set)";

  if (!Array.isArray(plants) || plants.length === 0) {
    return jsonResponse({ error: "plants array is required and must not be empty" }, 400);
  }

  const plantList = plants.map(function (p) {
    return [
      "- id: " + p.id,
      "  name: " + p.name,
      "  species: " + (p.species || "(unknown)"),
      "  area: " + (p.area || "(none)"),
      "  watering_type: " + (p.watering_type || "(none)"),
      "  interval_days: " + p.interval_days,
      "  last_watered: " + (p.last_watered || "(unknown)"),
      "  next_due: " + (p.next_due || "(unknown)"),
      "  notes: " + (p.notes || "(none)"),
    ].join("\n");
  }).join("\n\n");

  const prompt =
    "You're writing brief plant-care notes for a friend who's visiting once. For each plant below, return ONE short instruction (max 120 characters) telling them how to water THIS plant on the visit date.\n" +
    "\n" +
    "Style:\n" +
    "- Action-first; fragments are fine. Examples:\n" +
    "    \"Even coat - don't drench. Yellow leaves = overwatering.\"\n" +
    "    \"Soak 15-20 min in tray, drain well.\"\n" +
    "    \"Light mist on leaves.\"\n" +
    "    \"Swap vase water, rinse roots.\"\n" +
    "- Match watering_type to the verb (top water = even coat, bottom soak = tray soak, mist = mist leaves, change water = swap vase)\n" +
    "- Add ONE quick warning only if it's actually critical (e.g. \"yellow leaves = overwatering\")\n" +
    "- No greetings, no fluff, no full sentences when a fragment is clearer\n" +
    "\n" +
    "Return ONLY a JSON array: [{\"id\": \"plant-...\", \"brief\": \"...\"}]\n" +
    "Do not include markdown, code fences, or any text outside the JSON array.\n" +
    "\n" +
    "Visit date: " + visitDate + "\n" +
    "Today: " + today + "\n" +
    "\n" +
    "Plants:\n" + plantList;

  try {
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      return jsonResponse({ error: "Claude API error", details: errText }, 502);
    }

    const data = await claudeResponse.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) {
        return jsonResponse({ error: "Could not parse Claude response", raw: text }, 502);
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch (e2) {
        return jsonResponse({ error: "Could not parse Claude response", raw: text }, 502);
      }
    }

    if (!Array.isArray(parsed)) {
      return jsonResponse({ error: "Claude returned non-array", raw: text }, 502);
    }

    return jsonResponse({ briefs: parsed });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
};
