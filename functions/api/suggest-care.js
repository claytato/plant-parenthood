// Cloudflare Pages Function: POST /api/suggest-care
// Body: { "species": "Monstera deliciosa" }
// Returns: { "interval_days": 7, "notes": ["...", "..."] }

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

  let species;
  try {
    const body = await context.request.json();
    species = (body.species || "").trim();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!species) {
    return jsonResponse({ error: "species is required" }, 400);
  }

  const prompt =
    "You are a houseplant care assistant. For the plant species below, return ONLY a JSON object with two keys:\n" +
    "- \"interval_days\": typical watering interval in days, an integer between 1 and 30\n" +
    "- \"notes\": an array of 2 to 3 short care notes, each a complete sentence ending with a period and under 80 characters, focused on watering technique, soil, light, humidity, or common issues\n" +
    "\n" +
    "Do not include markdown, code fences, or any text outside the JSON object.\n" +
    "\n" +
    "Species: " + species;

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
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      return jsonResponse({ error: "Claude API error", details: errText }, 502);
    }

    const data = await claudeResponse.json();
    const text = (data.content && data.content[0] && data.content[0].text) || "";

    // Parse the JSON Claude returned. If it wrapped the JSON in prose, try to
    // extract the first {...} block.
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        return jsonResponse({ error: "Could not parse Claude response", raw: text }, 502);
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch (e2) {
        return jsonResponse({ error: "Could not parse Claude response", raw: text }, 502);
      }
    }

    return jsonResponse(parsed);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
};
