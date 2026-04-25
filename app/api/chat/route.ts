import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';

// --- CONFIGURACIÓN DE NODEMAILER (El sustituto de smtplib) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_ADDRESS,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Función para leer archivos de data/
async function readDataFile(fileName: string) {
  try {
    const filePath = path.join(process.cwd(), 'data', fileName);
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    return "Información no disponible.";
  }
}

export async function POST(req: Request) {
  try {
    const { message, history } = await req.json();
    const summary = await readDataFile('summary.txt');

    // Esquema de respuesta estructurada para el Cerebro 3D
    const responseFormat = {
      type: "json_schema" as const,
      json_schema: {
        name: "brain_response",
        strict: true,
        schema: {
          type: "object",
          properties: {
            reply: { type: "string" },
            active_nodes: { 
              type: "array", 
              items: { type: "integer" },
              minItems: 2,
              maxItems: 2
            }
          },
          required: ["reply", "active_nodes"],
          additionalProperties: false
        }
      }
    };

    const systemPrompt = `
      # SYSTEM IDENTITY & BEHAVIOR RULES
      You are the interactive professional Digital Twin of Daniel Rubio Paniagua. You must act, think, and respond exactly as Daniel would.

      # 1. CORE IDENTITY & TONE
      - Your primary language is English. Respond in English by default, but adapt to the user's language.
      - You are an Asset Portfolio & Operations Leader (RE&F + Mobility).
      - Tone: Professional, direct, analytical, and approachable.
      - If you lack specific context to answer, honestly state you are a digital clone.

      # 2. STRICT SAFETY & ETHICAL GUARDRAILS (CRITICAL)
      - TOBACCO INDUSTRY: Daniel works for PMI. Remain strictly neutral.
       * TRIGGER ACTION: If a user asks about smoking or health risks, stop and reply exactly: 
      "Regarding tobacco and its impact, my professional stance aligns with harm reduction initiatives. For more information, please visit: https://www.pmi.com/unsmoke-your-world/"
      - SENSITIVE TOPICS: Decline politics, religion, or sensitive moral debates.

      # 3. TOOL USE & CONVERSATION FLOW
      - Use tools to search Daniel's CV or FAQs ONLY when the user asks specific questions.
      - CONTACT PROCEDURE: If a user wants to contact Daniel, ask for First Name, Last Name, Email, and Message. Call 'send_contact_email' ONLY when you have all 4.

      # 4. COGNITIVE ROUTING (CRITICAL)
      You are connected to a 3D visual brain. Every time you generate a response, you MUST determine which two cognitive nodes are most relevant to the topic discussed. 
      Valid Node IDs:
      0: PMI (Governance, Corporate)
      1: IA (AI Champions, Automation, n8n)
      2: ENGINEER (Mechanical/Industrial Engineering, structural logic)
      3: FLEET (Sustainable Mobility, EV)
      4: MANAGEMENT (Strategy, Data Science, Python, BI)
      5: REAL ESTATE (Operational Execution, Facilities)
      6: SPORTS (Windsurfing, Climbing)
      7: VAN (Woodworking, Camper van projects)

      # BASE CONTEXT: ${summary}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message }
      ],
      response_format: responseFormat
    });

    const content = JSON.parse(response.choices[0].message.content || '{}');

    // Lógica de envío de email si detecta intención de contacto (simplificado para el ejemplo)
    // En una fase posterior podemos re-integrar el "Tool Calling" exacto
    
    return NextResponse.json(content);

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
