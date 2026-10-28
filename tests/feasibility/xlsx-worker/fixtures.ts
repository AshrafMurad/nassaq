// Synthetic technical fixtures only; this is not an application parser or policy.
export function textFixture(): string[][] {
  return [
    ['duplicate', 'duplicate', '', 'value'],
    ['0004', '=1+1', '', 'أحمد'],
    ['12345678901234567890', '03-04', '٠٠١٢٣', '  نص  '],
    ['+SUM(1,2)', '-1+2', '@SUM(1,2)', '\t=1+1'],
    ['سطر أول\nسطر ثان', 'He said "ok"', 'جدة, السعودية', '\u200fسجل-ABC'],
    ['é', 'e\u0301', '\ufffd', '\ufeffretained'],
    ['<img src=x onerror=alert(1)>', 'https://example.invalid/', '', ''],
    ['', '', '', ''],
  ];
}

export function csvBytes(rows: readonly (readonly string[])[]): Uint8Array {
  return new TextEncoder().encode(rows.map(row => row.map(value =>
    `"${value.replaceAll('"', '""')}"`).join(',')).join('\r\n'));
}

export function maxFixture(): string[][] {
  // 10,000 data rows, 100,000 data cells, plus one header; under 2 MiB.
  return [Array.from({ length: 10 }, (_, i) => `H${i}`),
    ...Array.from({ length: 10_000 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) => `${r}-${c}-نسّق`))];
}

export function wideFixture(): string[][] {
  return [Array.from({ length: 50 }, (_, i) => `H${i}`),
    ...Array.from({ length: 2_000 }, (_, r) =>
      Array.from({ length: 50 }, (_, c) => `${r}-${c}-نسّق`))];
}

export function longFixture(): string[][] {
  // Close to 2 MiB with every data cell at Excel's 32,767 UTF-16-unit limit.
  return [['value'], ...Array.from({ length: 63 }, (_, i) =>
    [String(i).padStart(2, '0') + 'x'.repeat(32_765)])];
}
