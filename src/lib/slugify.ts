export const slugify = (text: string, idPrefix: string): string => {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${idPrefix.slice(0, 8)}`;
};
