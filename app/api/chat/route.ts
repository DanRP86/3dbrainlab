import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Buscador seguro de archivos
async function getLocalData(fileName: string) {
  try {
    const pathsToTry = [
      path.join(process.cwd(), 'data', fileName),
      path.join(process.cwd(), fileName)
    ];
    for (const p of pathsToTry) {
      try { return await fs.readFile(p, 'utf-8'); } catch (e) { continue; }
    }
    return null;
  } catch (error) { return null; }
}

// 1. TUS TOOLS ORIGINALES INTACTAS
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_detailed_cv",
      description: "Call this tool to get Daniel's full detailed CV (JSON format). Use it ONLY when the user asks specific career questions."
    }
  },
  {
    type: "function",
    function: {
      name: "get_faqs",
      description: "Call this tool if the user asks about specific technologies (like n8n, Microsoft, AI agents), personal projects, or any 'What are you doing/studying' type of questions."
    }
  },
  {
    type: "function",
    function: {
      name: "send_contact_email",
      description: "Call this tool ONLY when the user explicitly wants to leave a message, contact Daniel, or hire him, AND you have already collected their Name, Surname, Email, and Message.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          surname: { type: "string" },
          user_email: { type: "string" },
          message_to_daniel: { type: "string" }
        },
        required: ["name", "surname", "user_email", "message_to_daniel"],
        additionalProperties: false
      }
    }
  }
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages = body.messages || body.history || [];

    const summaryContent = await getLocalData('summary.txt') || "Daniel is an Asset Portfolio & Operations Leader.";

    // 2. TU PROMPT EXACTO (+ una regla estricta de formato al final)
    const systemMessage: OpenAI.Chat.ChatCompletionMessageParam = {
      role: 'system',
      content: `
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

      # BASE CONTEXT: 
      ${summaryContent}

      IMPORTANT: You MUST append the chosen nodes at the very end of your response in this exact format:
      Nodes: [X, Y]
      `
    };

    const apiMessages = [systemMessage, ...messages];

    // 3. PRIMERA LLAMADA A OPENAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: apiMessages,
      tools: tools,
      tool_choice: 'auto',
    });

    let responseMessage = response.choices[0].message;

    // 4. LÓGICA DE EJECUCIÓN DE TOOLS
    if (responseMessage.tool_calls) {
      apiMessages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        let functionResponse = "";
        const functionName = toolCall.function.name;

        try {
          if (functionName === 'get_detailed_cv') {
            functionResponse = await getLocalData('professional_data.json') || "CV data missing.";
          } 
          else if (functionName === 'get_faqs') {
            functionResponse = await getLocalData('faqs.json') || "FAQ data missing.";
          } 
          else if (functionName === 'send_contact_email') {
            const args = JSON.parse(toolCall.function.arguments);
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD }
            });
            await transporter.sendMail({
              from: process.env.GMAIL_ADDRESS,
              to: process.env.GMAIL_ADDRESS,
              subject: `Digital Twin Contact: ${args.name} ${args.surname}`,
              text: `Email: ${args.user_email}\n\nMessage:\n${args.message_to_daniel}`
            });
            functionResponse = "Email successfully sent to Daniel.";
          }
        } catch (e) {
          functionResponse = "Error executing tool.";
        }

        apiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: functionResponse
        });
      }

      // 5. SEGUNDA LLAMADA (Para que OpenAI integre los datos de los JSON)
      const secondResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: apiMessages,
      });
      responseMessage = secondResponse.choices[0].message;
    }

    return NextResponse.json({ 
      content: responseMessage.content 
    });

  } catch (error: any) {
    return NextResponse.json({ error: "Server Error", details: error.message }, { status: 500 });
  }
}
