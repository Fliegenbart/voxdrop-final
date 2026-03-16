export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function replaceAllWithCount(params: {
  input: string;
  find: string;
  replace: string;
  caseSensitive: boolean;
}): { output: string; count: number } {
  const find = params.find;
  if (!find) return { output: params.input, count: 0 };

  const flags = params.caseSensitive ? "g" : "gi";
  const re = new RegExp(escapeRegExp(find), flags);
  const matches = params.input.match(re);
  const count = matches ? matches.length : 0;
  const output = params.input.replace(re, params.replace);
  return { output, count };
}

