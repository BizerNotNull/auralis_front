import { NextResponse } from "next/server";

const SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const DEFAULT_VOICE =
  process.env.AZURE_SPEECH_DEFAULT_VOICE ?? "zh-CN-XiaoyiNeural";
const DEFAULT_STYLE =
  process.env.AZURE_SPEECH_DEFAULT_STYLE ?? "general";
const DEFAULT_STYLE_DEGREE =
  process.env.AZURE_SPEECH_DEFAULT_STYLE_DEGREE ?? "1.0";
const OUTPUT_FORMAT =
  process.env.AZURE_SPEECH_OUTPUT_FORMAT ?? "audio-24khz-64kbitrate-mono-mp3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeForSsml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSsml({ text, voice, style, styleDegree, pitch, rate }) {
  const prosodyAttrs = [];
  if (rate) {
    prosodyAttrs.push(`rate=\"${rate}\"`);
  }
  if (pitch) {
    prosodyAttrs.push(`pitch=\"${pitch}\"`);
  }
  const prosodyOpen = prosodyAttrs.length ? `<prosody ${prosodyAttrs.join(" ")}>` : "";
  const prosodyClose = prosodyAttrs.length ? "</prosody>" : "";

  const escaped = escapeForSsml(text);

  return `<?xml version="1.0" encoding="utf-8"?>
<speak version="1.0" xml:lang="en-US" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts">
  <voice name="${voice}">
    <mstts:express-as style="${style}" styledegree="${styleDegree}">
      ${prosodyOpen}${escaped}${prosodyClose}
    </mstts:express-as>
  </voice>
</speak>`;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request) {
  if (!SPEECH_KEY || !SPEECH_REGION) {
    return NextResponse.json(
      {
        message:
          "Azure Speech credentials are not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.",
      },
      { status: 503 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { message: "Missing text field for speech synthesis" },
      { status: 400 },
    );
  }

  const voice =
    typeof payload?.voice === "string" && payload.voice.trim()
      ? payload.voice.trim()
      : DEFAULT_VOICE;
  const style =
    typeof payload?.style === "string" && payload.style.trim()
      ? payload.style.trim()
      : DEFAULT_STYLE;
  const styleDegree =
    typeof payload?.styleDegree === "string" && payload.styleDegree.trim()
      ? payload.styleDegree.trim()
      : DEFAULT_STYLE_DEGREE;
  const pitch =
    typeof payload?.pitch === "string" && payload.pitch.trim()
      ? payload.pitch.trim()
      : undefined;
  const rate =
    typeof payload?.rate === "string" && payload.rate.trim()
      ? payload.rate.trim()
      : undefined;

  const ssml = buildSsml({ text, voice, style, styleDegree, pitch, rate });

  try {
    const azureResponse = await fetch(
      `https://${SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/ssml+xml",
          "Ocp-Apim-Subscription-Key": SPEECH_KEY,
          "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
          "User-Agent": "Auralis-TTS/1.0",
        },
        body: ssml,
        cache: "no-store",
      },
    );

    if (!azureResponse.ok) {
      const errorBody = await azureResponse.text();
      return NextResponse.json(
        {
          message: "Azure TTS request failed",
          status: azureResponse.status,
          details: errorBody?.slice?.(0, 500) ?? null,
        },
        { status: 502 },
      );
    }

    const audioBuffer = await azureResponse.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to reach Azure Speech service" },
      { status: 502 },
    );
  }
}
