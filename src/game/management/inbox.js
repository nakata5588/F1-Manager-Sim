function text(value, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function ensureManagement(saveWorld) {
  saveWorld.world.management ??= {};
  return saveWorld.world.management;
}

export function ensureManagementInbox(saveWorld) {
  const management = ensureManagement(saveWorld);
  management.inbox ??= { nextId: 1, items: [] };
  management.inbox.nextId = Math.max(1, Number(management.inbox.nextId ?? 1));
  management.inbox.items ??= [];
  return management.inbox;
}

function normalizeDecision(decision) {
  if (!decision) return null;
  const options = (decision.options ?? [])
    .map((option) => ({
      id: text(option?.id).trim(),
      label: text(option?.label ?? option?.id).trim(),
      tone: option?.tone ?? null,
    }))
    .filter((option) => option.id);
  if (!options.length) return null;
  return {
    kind: text(decision.kind, "generic").trim() || "generic",
    refId: decision.refId ?? null,
    status: "pending",
    options,
    resolvedAt: null,
    selectedOptionId: null,
  };
}

export function addManagementInboxItem(saveWorld, input = {}) {
  const inbox = ensureManagementInbox(saveWorld);
  const sourceType = text(input.sourceType ?? input.category, "management").trim() || "management";
  const sourceId = input.sourceId ?? null;
  if (sourceId !== null) {
    const duplicate = inbox.items.find((item) => item.sourceType === sourceType && String(item.sourceId) === String(sourceId));
    if (duplicate) return structuredClone(duplicate);
  }

  const serial = inbox.nextId++;
  const item = {
    id: `inbox:${String(serial).padStart(6, "0")}`,
    date: text(input.date ?? saveWorld.clock?.date).slice(0, 10),
    category: text(input.category, "management").trim() || "management",
    priority: text(input.priority, "normal").trim() || "normal",
    sourceType,
    sourceId,
    title: text(input.title, "Management update").trim() || "Management update",
    body: text(input.body).trim(),
    unread: input.unread !== false,
    archived: false,
    createdSequence: Number(saveWorld.simulation?.nextEventSequence ?? 0),
    decision: normalizeDecision(input.decision),
  };
  inbox.items.push(item);
  return structuredClone(item);
}

export function listManagementInbox(saveWorld, options = {}) {
  const inbox = ensureManagementInbox(saveWorld);
  let rows = inbox.items.filter((item) => options.includeArchived === true || !item.archived);
  if (options.unreadOnly === true) rows = rows.filter((item) => item.unread);
  if (options.category) rows = rows.filter((item) => item.category === options.category);
  rows = [...rows].sort((a, b) => b.date.localeCompare(a.date) || b.createdSequence - a.createdSequence || b.id.localeCompare(a.id));
  const limit = Number(options.limit ?? 50);
  return structuredClone(Number.isInteger(limit) && limit > 0 ? rows.slice(0, limit) : rows);
}

export function managementInboxSummary(saveWorld) {
  const rows = ensureManagementInbox(saveWorld).items.filter((item) => !item.archived);
  return {
    total: rows.length,
    unread: rows.filter((item) => item.unread).length,
    decisionsPending: rows.filter((item) => item.decision?.status === "pending").length,
  };
}

export function markManagementInboxRead(saveWorld, itemId, read = true) {
  const item = ensureManagementInbox(saveWorld).items.find((row) => row.id === itemId);
  if (!item) throw new Error(`Inbox item '${itemId}' does not exist.`);
  item.unread = !read;
  return structuredClone(item);
}

export function archiveManagementInboxItem(saveWorld, itemId) {
  const item = ensureManagementInbox(saveWorld).items.find((row) => row.id === itemId);
  if (!item) throw new Error(`Inbox item '${itemId}' does not exist.`);
  item.archived = true;
  item.unread = false;
  return structuredClone(item);
}

export function resolveManagementInboxDecision(saveWorld, itemId, optionId) {
  const item = ensureManagementInbox(saveWorld).items.find((row) => row.id === itemId);
  if (!item) throw new Error(`Inbox item '${itemId}' does not exist.`);
  if (!item.decision) throw new Error(`Inbox item '${itemId}' has no decision.`);
  if (item.decision.status !== "pending") throw new Error(`Inbox decision '${itemId}' has already been resolved.`);
  const option = item.decision.options.find((row) => row.id === optionId);
  if (!option) throw new Error(`Decision option '${optionId}' is not available for '${itemId}'.`);

  item.decision.status = "resolved";
  item.decision.selectedOptionId = optionId;
  item.decision.resolvedAt = saveWorld.clock?.date ?? null;
  item.unread = false;
  return {
    item: structuredClone(item),
    resolution: {
      kind: item.decision.kind,
      refId: item.decision.refId,
      optionId,
    },
  };
}
