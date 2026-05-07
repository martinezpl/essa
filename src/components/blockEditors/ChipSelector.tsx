import type { Field } from "../../domain/types";

type ChipSelectorProps<TField extends Field> = {
  candidates: TField[];
  value: string[];
  onChange: (nextValue: string[]) => void;
  onClear?: () => void;
  emptyLabel?: string;
  getBadge?: (field: TField) => string | null;
};

export const ChipSelector = <TField extends Field>({
  candidates,
  value,
  onChange,
  onClear,
  emptyLabel = "No fields available.",
  getBadge,
}: ChipSelectorProps<TField>) => {
  const selectedIds = new Set(value);

  const toggleCandidate = (candidateId: string, checked: boolean) => {
    onChange(
      checked
        ? [...value, candidateId]
        : value.filter((id) => id !== candidateId),
    );
  };

  return (
    <div className="chip-picker">
      {candidates.length === 0 ? (
        <span className="block-node__empty">{emptyLabel}</span>
      ) : null}
      {candidates.map((candidate) => {
        const checked = selectedIds.has(candidate.id);
        const badge = getBadge?.(candidate);

        return (
          <label
            key={candidate.id}
            className={`chip${checked ? " chip--active" : ""}`}
          >
            <input
              hidden
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                toggleCandidate(candidate.id, event.target.checked)
              }
            />
            {candidate.name || candidate.id}
            {badge ? <span className="chip__badge">{badge}</span> : null}
          </label>
        );
      })}
      {onClear && value.length > 0 ? (
        <button type="button" className="chip" onClick={onClear}>
          Clear
        </button>
      ) : null}
    </div>
  );
};
