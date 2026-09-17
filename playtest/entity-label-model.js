export function buildTeamLabelMap(teams = []) {
  const labels = new Map();
  for (const row of teams ?? []) {
    const id = row?.id ?? row?.team_id ?? row?.teamId ?? null;
    const name = row?.name ?? row?.team_name ?? row?.display_name ?? null;
    if (!id || !name) continue;
    labels.set(String(id), String(name));
  }
  return labels;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveTeamLabelsInText(value, labels) {
  let output = String(value ?? "");
  if (!labels?.size) return output;
  for (const [id, name] of labels.entries()) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(id)}(?=$|[^A-Za-z0-9_])`, "g");
    output = output.replace(pattern, (_, prefix) => `${prefix}${name}`);
  }
  return output;
}
