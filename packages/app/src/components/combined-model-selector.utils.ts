import type { AgentModelDefinition } from "@server/server/agent/agent-sdk-types";
import type { AgentProviderDefinition } from "@server/server/agent/provider-manifest";
import { buildFavoriteModelKey, type FavoriteModelRow } from "@/hooks/use-form-preferences";
import { compareMatchScores, scoreTextFields } from "@/utils/score-match";

export type SelectorModelRow = FavoriteModelRow;

export type SelectorView =
  | { kind: "all" }
  | { kind: "provider"; providerId: string; providerLabel: string };

export function resolveProviderLabel(
  providerDefinitions: AgentProviderDefinition[],
  providerId: string,
): string {
  return (
    providerDefinitions.find((definition) => definition.id === providerId)?.label ?? providerId
  );
}

export function buildSelectedTriggerLabel(modelLabel: string): string {
  return modelLabel;
}

export function buildModelRows(
  providerDefinitions: AgentProviderDefinition[],
  allProviderModels: Map<string, AgentModelDefinition[]>,
): SelectorModelRow[] {
  const providerLabelMap = new Map(
    providerDefinitions.map((definition) => [definition.id, definition.label]),
  );
  const rows: SelectorModelRow[] = [];

  for (const definition of providerDefinitions) {
    const providerLabel = providerLabelMap.get(definition.id) ?? definition.label;
    for (const model of allProviderModels.get(definition.id) ?? []) {
      rows.push({
        favoriteKey: buildFavoriteModelKey({ provider: definition.id, modelId: model.id }),
        provider: definition.id,
        providerLabel,
        modelId: model.id,
        modelLabel: model.label,
        description: model.description,
      });
    }
  }

  return rows;
}

export function resolveInitialSelectorView(input: {
  providerDefinitions: AgentProviderDefinition[];
  selectedProvider: string;
  selectedModel: string;
  favoriteKeys: Set<string>;
  singleProviderView: SelectorView | null;
}): SelectorView {
  if (input.singleProviderView) {
    return input.singleProviderView;
  }

  const selectedProvider = input.selectedProvider.trim();
  if (!selectedProvider) {
    return { kind: "all" };
  }

  const selectedModel = input.selectedModel.trim();
  const selectedFavoriteKey = buildFavoriteModelKey({
    provider: selectedProvider,
    modelId: selectedModel,
  });
  const shouldShowFavorites =
    selectedModel.length > 0 && input.favoriteKeys.has(selectedFavoriteKey);
  if (shouldShowFavorites) {
    return { kind: "all" };
  }

  return {
    kind: "provider",
    providerId: selectedProvider,
    providerLabel: resolveProviderLabel(input.providerDefinitions, selectedProvider),
  };
}

export function matchesSearch(row: SelectorModelRow, normalizedQuery: string): boolean {
  return scoreModelRow(row, normalizedQuery) !== null;
}

function getModelRowSearchFields(row: SelectorModelRow): string[] {
  return [row.modelLabel, row.modelId, row.providerLabel, row.description ?? ""];
}

export function scoreModelRow(row: SelectorModelRow, normalizedQuery: string) {
  return scoreTextFields(normalizedQuery, getModelRowSearchFields(row));
}

export function filterAndRankModelRows(
  rows: SelectorModelRow[],
  normalizedQuery: string,
): SelectorModelRow[] {
  if (!normalizedQuery) return rows;
  const scored = rows
    .map((row) => ({ row, score: scoreModelRow(row, normalizedQuery) }))
    .filter((entry): entry is { row: SelectorModelRow; score: NonNullable<typeof entry.score> } =>
      Boolean(entry.score),
    );

  scored.sort((a, b) => {
    const cmp = compareMatchScores(a.score, b.score);
    if (cmp !== 0) return cmp;
    return a.row.modelLabel.localeCompare(b.row.modelLabel);
  });

  return scored.map((entry) => entry.row);
}
