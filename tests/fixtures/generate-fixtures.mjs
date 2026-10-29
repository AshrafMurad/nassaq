import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = __dirname;

const fixtures = [
  {
    name: 'arabic-utf8-bom.csv',
    content: Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]), // UTF-8 BOM
      Buffer.from('الاسم,الهاتف\nأحمد,001234\n', 'utf-8'),
    ]),
  },
  {
    name: 'arabic-utf8-no-bom.csv',
    content: Buffer.from('name,city\nSara,جدة\n', 'utf-8'),
  },
  {
    name: 'arabic-windows-1256.csv',
    // "name,city\nAli,محمد\n" with "محمد" encoded in Windows-1256 (E3 CD E3 CF)
    content: Buffer.concat([
      Buffer.from('name,city\nAli,', 'ascii'),
      Buffer.from([0xe3, 0xcd, 0xe3, 0xcf]),
      Buffer.from('\n', 'ascii'),
    ]),
  },
  {
    name: 'arabic-iso-8859-6.csv',
    // "name,city\nAli,محمد\n" with "محمد" encoded in ISO-8859-6 (E5 CD E5 CF)
    content: Buffer.concat([
      Buffer.from('name,city\nAli,', 'ascii'),
      Buffer.from([0xe5, 0xcd, 0xe5, 0xcf]),
      Buffer.from('\n', 'ascii'),
    ]),
  },
  {
    name: 'leading-zeros.csv',
    content: Buffer.from('code\n00073\n', 'utf-8'),
  },
  {
    name: 'long-id.csv',
    content: Buffer.from('id\n12345678901234567890\n', 'utf-8'),
  },
  {
    name: 'arabic-indic.csv',
    content: Buffer.from('count\n٠٠١٢٣\n', 'utf-8'),
  },
  {
    name: 'sku-date.csv',
    content: Buffer.from('sku\n03-04\n', 'utf-8'),
  },
  {
    name: 'mixed-direction.csv',
    content: Buffer.from('label\nسجل-ABC 001\n', 'utf-8'),
  },
  {
    name: 'quoted-comma.csv',
    content: Buffer.from('name,note\n"أحمد","جدة, السعودية"\n', 'utf-8'),
  },
  {
    name: 'quoted-quote.csv',
    content: Buffer.from('note\n"He said ""ok"""\n', 'utf-8'),
  },
  {
    name: 'multiline.csv',
    content: Buffer.from('note\n"سطر 1\nسطر 2"\n', 'utf-8'),
  },
  {
    name: 'semicolon.csv',
    content: Buffer.from('id;name\n0005;Ali\n', 'utf-8'),
  },
  {
    name: 'tab.csv',
    content: Buffer.from('id\tname\n0005\tAli\n', 'utf-8'),
  },
  {
    name: 'pipe.csv',
    content: Buffer.from('id|name\n0005|Ali\n', 'utf-8'),
  },
  {
    name: 'formula.csv',
    content: Buffer.from('cell\n=1+1\n', 'utf-8'),
  },
  {
    name: 'formula-prefixes.csv',
    content: Buffer.from(
      'prefix,formula\n"equals","=SUM(1,2)"\n"plus","+SUM(1,2)"\n"minus","-1+2"\n"at","@SUM(1,2)"\n"tab-equals","\t=1+1"\n',
      'utf-8',
    ),
  },
  {
    name: 'html-string.csv',
    content: Buffer.from('name\n"<img src=x onerror=alert(1)>"\n', 'utf-8'),
  },
  {
    name: 'whitespace.csv',
    content: Buffer.from('note\n"  نص  "\n', 'utf-8'),
  },
  {
    name: 'empty-values.csv',
    content: Buffer.from('a,b,c\n1,,3\n', 'utf-8'),
  },
  {
    name: 'numeric-valid.csv',
    content: Buffer.from('q\n2\n-17\n2.5\n', 'utf-8'),
  },
  {
    name: 'numeric-invalid.csv',
    content: Buffer.from('q\n2\n02\n', 'utf-8'),
  },
  {
    name: 'numeric-lexical.csv',
    content: Buffer.from('q\n0.10\n', 'utf-8'),
  },
  {
    name: 'uneven.csv',
    content: Buffer.from('a,b\nx\n', 'utf-8'),
  },
  {
    name: 'broken-quote.csv',
    content: Buffer.from('a,b\n"unfinished,b\n', 'utf-8'),
  },
  {
    name: 'empty.csv',
    content: Buffer.alloc(0),
  },
  {
    name: 'header-only.csv',
    content: Buffer.from('name,phone\n', 'utf-8'),
  },
  {
    name: 'zip-masquerading.csv',
    // ZIP local file header signature: PK\x03\x04 followed by binary zeroes
    content: Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(26, 0),
    ]),
  },
];

for (const fix of fixtures) {
  const filePath = path.join(FIXTURES_DIR, fix.name);
  fs.writeFileSync(filePath, fix.content);
  console.log(`Wrote ${fix.name} (${fix.content.length} bytes)`);
}
console.log(`Successfully generated ${fixtures.length} fixtures.`);
