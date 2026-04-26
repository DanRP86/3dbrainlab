import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Función para leer archivos de forma segura en Vercel
async function getLocalData(fileName: string) {
  try {
    // Intentamos buscar en la raíz/data y en la raíz del proyecto
    const pathsToTry = [
      path.join(process.cwd(), 'data', fileName),
      path.join(process.cwd(), fileName)
    ];
    
    for (const p of pathsToTry) {
      try {
        const content = await fs.readFile(p, 'utf-8');
        return content;
      } catch (e) { continue; }
    }
    return null;
  } catch (error) {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Verificamos si el frontend envía 'messages' o 'history'
    const messages = body.messages || body.history || [];

    // Cargamos contexto
    const summary = await getLocalData('summary.txt') || "Contexto: Daniel es un líder en Asset Portfolio.";
    
    const systemMessage: OpenAI.Chat.ChatCompletionMessageParam = {
      role: 'system',
      content: `
      # IDENTITY
      You are Daniel Rubio Paniagua's Digital Twin.
      
      # GUARDRAILS
      - Tobacco: If asked about health/smoking, say EXACTLY: "Regarding tobacco and its impact, my professional stance aligns with harm reduction initiatives. For more information, please visit: https://www.pmi.com/unsmoke-your-world/"
      - Professional, analytical, approachable.

      # COGNITIVE ROUTING
      End EVERY response with: "Nodes: [X, Y]" 
      IDs: 0:PMI, 1:IA, 2:ENGINEER, 3:FLEET, 4:MANAGEMENT, 5:REAL ESTATE, 6:SPORTS, 7:VAN.

      # CONTEXT:
      ${summary}`
    };

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [systemMessage, ...messages],
      // Las tools las activaremos en el siguiente paso una vez esto responda
    });

    return NextResponse.json({ 
      role: 'assistant', 
      content: response.choices[0].message.content 
    });

  } catch (error: any) {
    console.error("API ERROR:", error);
    return NextResponse.json({ error: "Server Error", details: error.message }, { status: 500 });
  }
}
