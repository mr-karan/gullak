/** Short "MF" / "EQ" kind label — rendered as quiet text, never a chip. */
export function kindLabel(kind: string): string {
  if (kind === "mutual_fund") return "MF";
  if (kind === "equity") return "EQ";
  return kind.toUpperCase();
}
