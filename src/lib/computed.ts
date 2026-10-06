import type {
  ComputedField,
  ComputedOperation,
  FormField,
} from "@/types/form-builder";

export function applyOperation(
  operation: ComputedOperation,
  values: number[],
): number {
  if (values.length === 0) return 0;
  switch (operation) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "average":
      return values.reduce((a, b) => a + b, 0) / values.length;
    case "multiply":
      return values.reduce((a, b) => a * b, 1);
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
  }
}

export function formatComputedResult(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function isComputedField(field: FormField): field is ComputedField {
  return field.type === "computed";
}

// Does `candidateFieldId` (transitively, through its own Computed terms)
// depend on `currentFieldId`? Used to stop the term picker from offering a
// choice that would create a dependency cycle.
export function wouldCreateCycle(
  fields: FormField[],
  currentFieldId: string,
  candidateFieldId: string,
): boolean {
  if (candidateFieldId === currentFieldId) return true;
  const byId = new Map(fields.map((f) => [f.id, f]));
  const visited = new Set<string>();

  function dependsOnCurrent(id: string): boolean {
    if (id === currentFieldId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const field = byId.get(id);
    if (!field || !isComputedField(field)) return false;
    return field.terms.some(
      (term) => term.type === "field" && dependsOnCurrent(term.fieldId),
    );
  }

  return dependsOnCurrent(candidateFieldId);
}

// Resolves every Computed field's numeric value in dependency order, given
// the already-known values of the plain Number/Rating fields.
export function resolveComputedValues(
  fields: FormField[],
  numericValues: Map<string, number>,
): Map<string, number> {
  const computedFields = fields.filter(isComputedField);
  const byId = new Map(computedFields.map((f) => [f.id, f]));
  const resolved = new Map<string, number>();

  function resolve(id: string): number {
    if (resolved.has(id)) return resolved.get(id)!;
    if (numericValues.has(id)) return numericValues.get(id)!;
    const field = byId.get(id);
    if (!field) return 0;
    // Mark early to guard against any cycle that slipped through.
    resolved.set(id, 0);
    const values = field.terms.map((term) =>
      term.type === "constant" ? term.value : resolve(term.fieldId),
    );
    const result = applyOperation(field.operation, values);
    resolved.set(id, result);
    return result;
  }

  for (const field of computedFields) resolve(field.id);
  return resolved;
}
