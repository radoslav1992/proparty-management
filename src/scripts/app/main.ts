import { html, nothing, render as paint } from "lit-html";
import { addMonths } from "../../lib/dates";
import { demoWorkspace } from "../../lib/demo";
import type { Workspace } from "../../lib/types";
import { app, demo, el, isView, VIEWS, type View } from "./state";
import { btn, empty, locale, toast } from "./ui";
import {
  chargeForm,
  confirmAction,
  deleteAccountForm,
  editorChanged,
  endLeaseForm,
  expenseForm,
  fileForm,
  leaseForm,
  maintenanceForm,
  paymentForm,
  propertyDetail,
  propertyForm,
  tenantForm,
  tenantStatement,
} from "./modals";
import { overview } from "./views/overview";
import { properties } from "./views/properties";
import { tenants } from "./views/tenants";
import { leases } from "./views/leases";
import { rent } from "./views/rent";
import { maintenance } from "./views/maintenance";
import { expenses } from "./views/expenses";
import { documents } from "./views/documents";
import { reports } from "./views/reports";
import { assistant, chat, type ChatMessage } from "./views/assistant";
import { settings } from "./views/settings";
import { activity, activityView, loadActivity } from "./views/activity";
import { api, signIn } from "./api";
import { withThumbnail } from "./thumbnail";

const views: Record<View, () => unknown> = {
  overview,
  properties,
  tenants,
  leases,
  rent,
  maintenance,
  expenses,
  documents,
  reports,
  activity: activityView,
  assistant,
  settings,
};
const forms: Record<string, (id: string) => void> = {
  properties: propertyForm,
  tenants: tenantForm,
  leases: leaseForm,
  maintenance: maintenanceForm,
  expenses: expenseForm,
  charges: chargeForm,
};

// lit renders after any existing children, so the server-rendered spinner is cleared once.
let painted = false;
function show(content: unknown) {
  if (!painted) {
    el.main.replaceChildren();
    painted = true;
  }
  paint(content, el.main);
}
const verifyBanner = () =>
  html`<div class="note-box verify-banner" role="status">
    <span
      >Confirm your email address, ${app.data.user.email}, to use the AI
      assistant and file uploads. The link is in your inbox.</span
    >${btn("Send a new link", "resend-verification", "", "button small outline")}
  </div>`;

function render() {
  document.querySelector("#breadcrumb")!.textContent = VIEWS[app.view];
  document
    .querySelectorAll<HTMLElement>("[data-view]")
    .forEach((a) => a.classList.toggle("active", a.dataset.view === app.view));
  show(
    html`${app.data.emailUnverified ? verifyBanner() : nothing}${views[
      app.view
    ]()}`,
  );
  if (app.view === "activity" && activity.state === "idle")
    void loadActivity(render);
}

function updateChrome() {
  const data = app.data;
  document.querySelector("#workspace-name")!.textContent =
    data.user.company || "My workspace";
  document.querySelector("#plan-info")!.textContent =
    `${data.limits.label} plan · ${data.properties.length}/${data.limits.properties} properties`;
  document.querySelector(".avatar")!.textContent = data.user.name
    .slice(0, 1)
    .toUpperCase();
  document.querySelector("#today-label")!.textContent =
    new Date().toLocaleDateString(locale(), {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
}
/** Merges collections from the API, keeping voided charges out of every view. */
function merge(part: Partial<Workspace>) {
  if (part.charges) part.charges = part.charges.filter((c) => !c.voided);
  Object.assign(app.data, part);
  activity.state = "idle";
}

async function load() {
  try {
    const since = app.data?.windowStart;
    app.data = (
      demo
        ? demoWorkspace()
        : await api("workspace" + (since ? "?since=" + since : ""))
    ) as Workspace;
    merge({ charges: app.data.charges });
    updateChrome();
    render();
  } catch (err) {
    show(
      empty(
        "We couldn’t open your workspace",
        (err as Error).message,
        "Try again",
        "reload",
      ),
    );
  }
}

// The collections each kind of change can touch; a save reloads only those.
const AFFECTS: Record<string, (keyof Workspace)[]> = {
  properties: ["properties", "files"],
  tenants: ["tenants"],
  leases: ["leases", "charges"],
  payments: ["payments", "charges"],
  charges: ["charges"],
  maintenance: ["maintenance"],
  expenses: ["expenses"],
  files: ["files"],
};
async function refresh(record: string) {
  const only = AFFECTS[record];
  if (!only) return load();
  merge(
    await api(`workspace?only=${only.join(",")}&since=${app.data.windowStart}`),
  );
  updateChrome();
  render();
}
/** Loads older payments, charges and expenses when a chosen month (or the overview's six-month chart) reaches past them. */
async function ensureHistory(month: string) {
  const first = addMonths(month, -5);
  if (demo || !app.data.windowStart || first >= app.data.windowStart) return;
  merge(await api(`workspace?only=charges,payments,expenses&since=${first}`));
}

function navigate(next: string | undefined) {
  app.view = isView(next) ? next : "overview";
  app.query = "";
  app.filter = "all";
  history.pushState(null, "", `${location.pathname}?view=${app.view}`);
  el.root.classList.remove("nav-open");
  document
    .querySelector(".menu-toggle")
    ?.setAttribute("aria-expanded", "false");
  render();
}

function ensureWritable() {
  if (!demo) return true;
  toast(
    "This is a read-only demo. Create a free workspace to save your own records.",
  );
  return false;
}

const DELETE_TEXT: Record<string, [string, string]> = {
  payments: [
    "Reverse this payment?",
    "The payment will be removed and its rent balance restored.",
  ],
  charges: [
    "Remove this rent charge?",
    "It will no longer count toward balances, and monthly generation will not recreate it.",
  ],
};

async function action(name: string, id: string, button: HTMLButtonElement) {
  // Actions that only open or close something work in the demo too.
  if (name === "close") return closeEditor();
  if (name === "reload") return load();
  if (name === "property-detail") return propertyDetail(id);
  if (name === "tenant-statement") return tenantStatement(id);
  if (name === "print-statement") return print();
  if (name === "older-activity") return loadActivity(render, true);
  if (name === "reload-activity") {
    activity.state = "idle";
    return render();
  }
  if (name.startsWith("new-")) return forms[name.slice(4)]?.("");
  if (name.startsWith("edit-")) return forms[name.slice(5)]?.(id);
  if (name === "upload-file") return fileForm(id);
  if (name === "record-payment") return paymentForm(id);
  if (name === "logout") {
    if (!demo) await api("auth/logout", "POST", {});
    location.href = "/";
    return;
  }
  if (name === "export-report") {
    if (demo) return toast("Create a workspace to export your own reports.");
    location.href = "/api/reports?month=" + app.month;
    return;
  }
  if (name === "export-data")
    return toast("Create a workspace to download your own data.");
  if (!ensureWritable()) return;
  if (name === "delete-account") return deleteAccountForm();
  if (name.startsWith("delete-")) {
    const type = name.slice(7);
    const [title, text] = DELETE_TEXT[type] ?? [
      "Delete this record?",
      "This cannot be undone. Linked financial history may prevent deletion.",
    ];
    return confirmAction(title, text, "confirmed-delete-" + type, id);
  }
  if (name === "end-lease") return endLeaseForm(id);
  button.disabled = true;
  try {
    if (name.startsWith("confirmed-delete-")) {
      const type = name.slice(17);
      await api(type + "/" + id, "DELETE");
      el.dialog.close();
      toast("Record removed.");
      await refresh(type);
    }
    if (name === "resend-verification") {
      await api("account/verify-email", "POST", {});
      toast(`We sent a new confirmation link to ${app.data.user.email}.`);
    }
    if (name === "sign-out-others") {
      const r = await api("account/sign-out-others", "POST", {});
      toast(
        r.signedOut
          ? `Signed out of ${r.signedOut} other ${r.signedOut === 1 ? "session" : "sessions"}.`
          : "No other devices were signed in.",
      );
    }
    if (name === "generate-charges") {
      await api("charges/generate", "POST", { month: app.month });
      toast("Rent charges are up to date.");
      await refresh("charges");
    }
    if (name === "checkout") {
      location.href = (await api("billing/checkout", "POST", { plan: id })).url;
    }
    if (name === "billing-portal") {
      location.href = (await api("billing/portal", "POST", {})).url;
    }
  } finally {
    button.disabled = false;
  }
}

/** Text pieces from a server-sent-events answer (Workers AI or OpenAI-style chunks). */
async function* streamText(res: Response) {
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value.replace(/\r\n/g, "\n");
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      for (const line of event.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const chunk = JSON.parse(data);
          const piece = chunk.response ?? chunk.choices?.[0]?.delta?.content;
          if (piece) yield String(piece);
        } catch {
          // A malformed event is skipped; the rest of the answer still arrives.
        }
      }
    }
  }
}

async function askAssistant(form: HTMLFormElement) {
  const input = form.querySelector("textarea")!;
  const prompt = input.value.trim();
  if (!prompt) return;
  const history = chat
    .filter((m) => !m.state)
    .slice(-6)
    .map(({ role, content }) => ({ role, content }));
  const reply: ChatMessage = {
    role: "assistant",
    content: "",
    state: "streaming",
  };
  chat.push({ role: "user", content: prompt }, reply);
  input.value = "";
  render();
  let painting = false;
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, history }),
    });
    if (!res.ok) {
      if (res.status === 401) signIn();
      const error = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(error?.error || "The assistant could not answer.");
    }
    if (res.headers.get("content-type")?.includes("text/event-stream")) {
      for await (const piece of streamText(res)) {
        reply.content += piece;
        // Repaint at most once a frame while the answer streams in.
        if (!painting) {
          painting = true;
          requestAnimationFrame(() => {
            painting = false;
            render();
          });
        }
      }
    } else reply.content = ((await res.json()) as { answer: string }).answer;
    if (!reply.content.trim())
      throw new Error("The assistant returned an empty answer.");
    delete reply.state;
    app.data.aiUsage++;
  } catch (err) {
    reply.state = "error";
    reply.content = (err as Error).message;
  }
  render();
  el.main.querySelector(".chat-message:last-child")?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "nearest",
  });
}

async function submit(form: HTMLFormElement) {
  if (form.id === "ai-form") return askAssistant(form);
  const values = Object.fromEntries(new FormData(form));
  if (form.id === "password-form") {
    await api("account/password", "POST", values);
    form.reset();
    return toast("Password changed. Other devices have been signed out.");
  }
  if (form.id === "delete-account-form") {
    await api("account/delete", "POST", values);
    location.href = "/";
    return;
  }
  if (form.id === "settings-form") {
    await api("settings", "PATCH", values);
    toast("Workspace details saved.");
    return load();
  }
  const type = form.dataset.record!,
    id = form.dataset.id;
  await api(
    type + (id ? "/" + id : ""),
    id ? "PATCH" : "POST",
    type === "files" ? await withThumbnail(new FormData(form)) : values,
  );
  el.dialog.close();
  toast(
    type === "files"
      ? "File uploaded securely."
      : "Saved. One less thing to keep in your head.",
  );
  await refresh(type);
}

document.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const nav = target.closest<HTMLElement>("[data-view]");
  if (nav) {
    event.preventDefault();
    return navigate(nav.dataset.view);
  }
  const button = target.closest<HTMLButtonElement>("[data-action]");
  if (button) {
    event.preventDefault();
    try {
      await action(button.dataset.action!, button.dataset.id || "", button);
    } catch (err) {
      toast((err as Error).message);
    }
    return;
  }
  const prompt = target.closest<HTMLElement>("[data-prompt]");
  const input = el.main.querySelector<HTMLTextAreaElement>("[name=prompt]");
  if (prompt && input) {
    input.value = prompt.dataset.prompt!;
    input.focus();
  }
});
const menu = document.querySelector(".menu-toggle");
menu?.addEventListener("click", () => {
  menu.setAttribute(
    "aria-expanded",
    String(el.root.classList.toggle("nav-open")),
  );
});
document.addEventListener("click", (event) => {
  if (
    el.root.classList.contains("nav-open") &&
    !(event.target as HTMLElement).closest(".sidebar,.menu-toggle")
  ) {
    el.root.classList.remove("nav-open");
    menu?.setAttribute("aria-expanded", "false");
  }
});
el.main.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "month-filter") {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.value)) return;
    app.month = input.value;
    ensureHistory(app.month)
      .catch((err) => toast((err as Error).message))
      .finally(render);
  }
  if (input.id === "status-filter") {
    app.filter = input.value as typeof app.filter;
    render();
  }
});
// The search box keeps focus and caret because lit only patches what changed; fast typing renders once per frame.
let searchFrame = 0;
el.main.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "search") {
    app.query = input.value;
    cancelAnimationFrame(searchFrame);
    searchFrame = requestAnimationFrame(render);
  }
});
/** Closing a form someone has edited asks first, so a stray Esc or click keeps their typing. */
const keepEdits = () =>
  editorChanged() && !confirm("Discard the changes in this form?");
function closeEditor() {
  if (!keepEdits()) el.dialog.close();
}
// Esc is handled here rather than in "cancel", which browsers may skip on a repeated Esc.
el.dialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && editorChanged()) {
    event.preventDefault();
    closeEditor();
  }
});
el.dialog.addEventListener("cancel", (event) => {
  if (keepEdits()) event.preventDefault();
});
// A new lease starts from the chosen property's advertised rent.
el.editor.addEventListener("change", (event) => {
  const select = event.target as HTMLSelectElement;
  const rentInput = select
    .closest("form[data-record=leases]")
    ?.querySelector<HTMLInputElement>("[name=rent]");
  if (rentInput && select.name === "property_id")
    rentInput.value = String(
      (app.data.properties.find((p) => p.id === select.value)?.rent_cents ??
        0) / 100 || "",
    );
});
document.addEventListener("submit", async (event) => {
  const form = event.target as HTMLFormElement;
  if (
    !form.matches(
      ".record-form,#settings-form,#password-form,#delete-account-form,#ai-form",
    )
  )
    return;
  event.preventDefault();
  if (!ensureWritable()) return;
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const message = form.querySelector(".form-message");
  if (message) message.textContent = "";
  button.disabled = true;
  try {
    await submit(form);
  } catch (err) {
    if (message) message.textContent = (err as Error).message;
    else toast((err as Error).message);
  } finally {
    button.disabled = false;
  }
});
window.addEventListener("popstate", () => {
  const next = new URLSearchParams(location.search).get("view");
  app.view = isView(next) ? next : "overview";
  render();
});
load();
