export function arcadeField(field: string): string {
  return `$feature[${JSON.stringify(field)}]`;
}

export function arcadeNumber(value: number): string {
  return Number(value).toPrecision(15).replace(/\.?0+$/, "");
}

export function chartTotalExpression(fields: string[]): string {
  return fields
    .map((field) => {
      const ref = arcadeField(field);
      return `When(IsEmpty(${ref}),0,Max(${ref},0))`;
    })
    .join(" + ");
}

export function sizeFieldExpression(field: string): string {
  const ref = arcadeField(field);
  return `When(IsEmpty(${ref}),0,Max(${ref},0))`;
}
