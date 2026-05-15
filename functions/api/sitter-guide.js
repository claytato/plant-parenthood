// Cloudflare Pages Function: POST /api/sitter-guide
// Body: { plants: [...], trip_start: "2026-05-20", trip_end: "2026-05-27", today: "2026-05-13" }
// Returns: { paragraphs: [{ id: "plant-...", paragraph: "..." }, ...] }

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
  const tripStart = body.trip_start || "(not set)";
  const tripEnd = body.trip_end || "(not set)";
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
    "You are writing a houseplant-watering guide for a friend who will be plant-sitting while the owner is away. For each plant below, write ONE warm, plain-English paragraph (3-5 sentences) telling the friend exactly what to do during the trip dates.\n" +
    "\n" +
    "Tone: friendly, like a text to a friend. Casual but clear. Use the plant's name conversationally; don't say \"the plant.\"\n" +
    "\n" +
    "For each plant, cover:\n" +
    "- Whether and when it needs watering during the trip (use interval_days, last_watered, and next_due to figure out which dates fall inside the trip window)\n" +
    "- The kind of watering it likes (use watering_type)\n" +
    "- One thing to watch for (overwatering, dry soil, drooping leaves, etc.)\n" +
    "- Any quirks worth noting from the user's notes\n" +
    "\n" +
    "Do NOT include a greeting, sign-off, or general advice across plants. Just the per-plant paragraphs. The user's app will add a greeting and general intro separately.\n" +
    "\n" +
    "Return ONLY a JSON array. Each item must have the shape: {\"id\": \"plant-1234567890\", \"paragraph\": \"...\"}\n" +
    "Do not include markdown, code fences, or any text outside the JSON array.\n" +
    "\n" +
    "Today's date: " + today + "\n" +
    "Trip dates: " + tripStart + " to " + tripEnd + "\n" +
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
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
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

    return jsonResponse({ paragraphs: parsed });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
};
