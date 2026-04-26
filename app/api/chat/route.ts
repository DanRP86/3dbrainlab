import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    // BLINDAJE: Verificamos que el body tenga la estructura correcta
    const body = await req.json();
    const userMessages = Array.isArray(body.messages) ? body.messages : [];

    // Lectura de contexto
    const summaryPath = path.join(process.cwd(), 'data', 'summary.txt');
    let summaryContent = "Context unavailable.";
    try {
      summaryContent = await fs.readFile(summaryPath, 'utf-8');
    } catch (e) {
      console.warn("Summary not found at /data/summary.txt");
    }

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
      `
    };

    const apiMessages = [systemMessage, ...userMessages];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: apiMessages,
      tools: tools,
      tool_choice: 'auto',
    });

    let responseMessage = response.choices[0].message;

    // Lógica de Tool Calling
    if (responseMessage.tool_calls) {
      apiMessages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        let content = "";
        try {
          if (toolCall.function.name === 'get_detailed_cv') {
            content = await fs.readFile(path.join(process.cwd(), 'data', 'professional_data.json'), 'utf-8');
          } else if (toolCall.function.name === 'get_faqs') {
            content = await fs.readFile(path.join(process.cwd(), 'data', 'faqs.json'), 'utf-8');
          } else if (toolCall.function.name === 'send_contact_email') {
            const args = JSON.parse(toolCall.function.arguments);
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: process.env.GMAIL_ADDRESS, pass: process.env.GMAIL_APP_PASSWORD }
            });
            await transporter.sendMail({
              from: process.env.GMAIL_ADDRESS,
              to: process.env.GMAIL_ADDRESS,
              subject: `Digital Twin Contact: ${args.name}`,
              text: `From: ${args.user_email}\n\n${args.message_to_daniel}`
            });
            content = "Email sent successfully.";
          }
        } catch (err) {
          content = "Error accessing data.";
        }

        apiMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: content
        });
      }

      const secondResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: apiMessages,
      });
      responseMessage = secondResponse.choices[0].message;
    }

    return NextResponse.json({ 
      role: 'assistant', 
      content: responseMessage.content 
    });

  } catch (error: any) {
    console.error('Error en API:', error);
    return NextResponse.json({ error: "Check server logs" }, { status: 500 });
  }
}
