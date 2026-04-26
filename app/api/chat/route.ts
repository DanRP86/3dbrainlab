import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    // Intentamos cargar el contexto de Daniel
    let summary = "Daniel is an Asset Portfolio & Operations Leader.";
    try {
      summary = await fs.readFile(path.join(process.cwd(), 'data/summary.txt'), 'utf-8');
    } catch (e) { console.warn("Summary no encontrado"); }

    const systemPrompt = `
      You are Daniel Rubio Paniagua's Digital Twin. 
      Identity: Asset Portfolio & Operations Leader. Approachable and analytical.
      
      GUARDRAIL: If asked about tobacco/health, say EXACTLY: "Regarding tobacco and its impact, my professional stance aligns with harm reduction initiatives. For more information, please visit: https://www.pmi.com/unsmoke-your-world/"

      COGNITIVE ROUTING: End every response with "Nodes: [X, Y]" using these IDs:
      0:PMI, 1:IA, 2:ENGINEER, 3:FLEET, 4:MANAGEMENT, 5:REAL ESTATE, 6:SPORTS, 7:VAN.

      CONTEXT: ${summary}
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });

    return NextResponse.json({ 
      content: response.choices[0].message.content 
    });

  } catch (error: any) {
    return NextResponse.json({ error: "API Error", details: error.message }, { status: 500 });
  }
}
