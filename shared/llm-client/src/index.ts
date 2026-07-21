import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  text: string | null;
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "stop";
}

export type Provider = "anthropic" | "openai";

export interface LLMOverrides {
  anthropicKey?: string;
  openaiKey?: string;
}

export function detectProvider(overrides?: LLMOverrides): Provider {
  if (overrides?.anthropicKey) return "anthropic";
  if (overrides?.openaiKey) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error("Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set");
}

export async function chat(
  messages: Message[],
  tools: Tool[] = [],
  systemPrompt?: string,
  overrides?: LLMOverrides
): Promise<LLMResponse> {
  const provider = detectProvider(overrides);
  if (provider === "anthropic") {
    return chatAnthropic(messages, tools, systemPrompt, overrides);
  }
  return chatOpenAI(messages, tools, systemPrompt, overrides);
}

async function chatAnthropic(
  messages: Message[],
  tools: Tool[],
  systemPrompt?: string,
  overrides?: LLMOverrides
): Promise<LLMResponse> {
  const client = new Anthropic({
    ...(overrides?.anthropicKey && { apiKey: overrides.anthropicKey }),
  });

  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
    max_tokens: 4096,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(systemPrompt && { system: systemPrompt }),
    ...(anthropicTools.length > 0 && { tools: anthropicTools }),
  };

  const response = await client.messages.create(params);

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("") || null;

  const toolCalls: ToolCall[] = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

  const stopReason =
    response.stop_reason === "tool_use" ? "tool_use" : "end_turn";

  return { text, toolCalls, stopReason };
}

async function chatOpenAI(
  messages: Message[],
  tools: Tool[],
  systemPrompt?: string,
  overrides?: LLMOverrides
): Promise<LLMResponse> {
  const client = new OpenAI({
    ...(overrides?.openaiKey && { apiKey: overrides.openaiKey }),
  });

  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
    messages: openaiMessages,
    ...(openaiTools.length > 0 && { tools: openaiTools }),
  });

  const choice = response.choices[0];
  const text = choice.message.content;
  const rawCalls = choice.message.tool_calls ?? [];

  const toolCalls: ToolCall[] = rawCalls.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));

  const stopReason =
    choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";

  return { text, toolCalls, stopReason };
}
