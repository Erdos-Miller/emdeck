// Visibility is a view preference; keys identify mounted local or background panes.
export const restoreHiddenSessions = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (key): key is string => typeof key === 'string' && !!key && key.length <= 512
          )
        ),
      ].slice(0, 128)
    : [];
