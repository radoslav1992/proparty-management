import { html } from "lit-html";
import { app } from "../state";
import { arrow, heading, markdown } from "../ui";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  state?: "streaming" | "error";
}
/** The conversation lasts until the page reloads, so moving between views keeps it. */
export const chat: ChatMessage[] = [];

const PROMPTS = [
  "Summarise my outstanding rent.",
  "Which maintenance issues should I prioritise?",
  "Draft a friendly reminder for an overdue rent payment.",
  "Give me a quick overview of my portfolio.",
];
export const usageLine = () =>
  `${app.data.aiUsage} of ${app.data.limits.ai} requests used today. Your allowance resets at midnight UTC.`;

const message = (m: ChatMessage) =>
  m.role === "user"
    ? html`<div class="chat-message user">${m.content}</div>`
    : html`<div
        class="chat-message ai ${m.state === "error" ? "error" : ""}"
        aria-busy=${m.state === "streaming" ? "true" : "false"}
      >
        ${
          m.state === "error"
            ? m.content
            : m.content
              ? markdown(m.content)
              : "Thinking through your workspace…"
        }
      </div>`;

export function assistant() {
  return html`${heading("A helpful second pair of eyes.", usageLine())}
    <div class="assistant-layout">
      <div class="assistant-intro">
        <span class="round-icon">✧</span>
        <h2>What can I help you untangle?</h2>
        <p>
          Ask about your properties, outstanding rent or open maintenance.<br />Or
          let’s find the right words for your next message.
        </p>
      </div>
      <div class="prompt-options">
        ${PROMPTS.map(
          (p) => html`<button data-prompt=${p}>${p} ${arrow}</button>`,
        )}
      </div>
      <div class="chat-messages" aria-live="polite">${chat.map(message)}</div>
      <form class="chat-form" id="ai-form">
        <textarea
          name="prompt"
          aria-label="Ask your property assistant"
          maxlength="2000"
          required
          placeholder="Ask about your workspace…"
        ></textarea
        ><button class="button" type="submit">Send ${arrow}</button>
      </form>
      <p class="assistant-note">
        AI can make mistakes. Review every draft. It cannot change records or
        send messages. Follow-up questions see the last few messages.
      </p>
    </div>`;
}
