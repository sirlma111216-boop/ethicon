// 공모전 첨부용 문서 생성: 저장소의 마크다운 문서를 .docx 로 변환한다.
// 사용: node scripts/build-submission-docs.mjs  → submission/*.docx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const OUT = path.resolve('submission');
await mkdir(OUT, { recursive: true });

const FONT = 'Malgun Gothic';
const PAGE_W = 11906; // A4 DXA
const MARGIN = 1134; // 2cm
const CONTENT_W = PAGE_W - MARGIN * 2;

// ---------- 인라인 마크다운 → TextRun ----------
function inlineRuns(text, base = {}) {
  const runs = [];
  // 링크, 굵게, 코드 순으로 토큰화
  const re = /(\[([^\]]+)\]\((https?:[^)\s]+)\))|(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    if (m[1]) {
      runs.push(new ExternalHyperlink({ children: [new TextRun({ text: m[2], style: 'Hyperlink', font: FONT, ...base })], link: m[3] }));
    } else if (m[4]) {
      runs.push(new TextRun({ text: m[5], bold: true, font: FONT, ...base }));
    } else if (m[6]) {
      runs.push(new TextRun({ text: m[7], font: 'Consolas', shading: { type: ShadingType.CLEAR, fill: 'F1F1F5' }, ...base }));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return runs;
}

const cleanCell = (s) => s.trim().replace(/<br\s*\/?>/g, ' ');

// ---------- 마크다운 블록 → docx 요소 ----------
function mdToChildren(md, opts = {}) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const para = (text, extra = {}) => new Paragraph({ children: inlineRuns(text), spacing: { after: 120 }, ...extra });
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // 코드 블록
    if (line.startsWith('```')) {
      i++;
      const buf = [];
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      for (const l of buf) out.push(new Paragraph({ children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 18 })], shading: { type: ShadingType.CLEAR, fill: 'F4F4F8' }, spacing: { after: 0 } }));
      out.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      continue;
    }
    // 제목
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length + (opts.shiftHeadings ?? 0);
      const hl = level <= 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4;
      out.push(new Paragraph({ heading: hl, children: inlineRuns(h[2].replace(/\*\*/g, '')), spacing: { before: 240, after: 120 } }));
      i++;
      continue;
    }
    // 표
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const header = line.split('|').slice(1, -1).map(cleanCell);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].split('|').slice(1, -1).map(cleanCell));
        i++;
      }
      const cols = header.length;
      const colW = Math.floor(CONTENT_W / cols);
      const widths = Array(cols).fill(colW);
      const mkRow = (cells, isHeader) =>
        new TableRow({
          tableHeader: isHeader,
          children: cells.slice(0, cols).concat(Array(Math.max(0, cols - cells.length)).fill('')).map(
            (c) =>
              new TableCell({
                width: { size: colW, type: WidthType.DXA },
                shading: isHeader ? { type: ShadingType.CLEAR, fill: 'E8EAF6' } : undefined,
                margins: { top: 60, bottom: 60, left: 100, right: 100 },
                children: [new Paragraph({ children: inlineRuns(c, { size: 18, bold: isHeader || undefined }), spacing: { after: 0 } })],
              }),
          ),
        });
      out.push(new Table({ columnWidths: widths, width: { size: CONTENT_W, type: WidthType.DXA }, rows: [mkRow(header, true), ...rows.map((r) => mkRow(r, false))] }));
      out.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      continue;
    }
    // 인용
    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(new Paragraph({ children: inlineRuns(buf.join(' '), { italics: true, color: '444466' }), indent: { left: 400 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: '5865F2', space: 8 } }, spacing: { after: 160 } }));
      continue;
    }
    // 목록
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        const level = Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
        const numbered = /\d+\./.test(m[2]);
        out.push(new Paragraph({ children: inlineRuns(m[3]), numbering: { reference: numbered ? 'nums' : 'bullets', level }, spacing: { after: 60 } }));
        i++;
        // 들여쓴 이어지는 줄
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i])) {
          out.push(new Paragraph({ children: inlineRuns(lines[i].trim()), indent: { left: 720 + level * 360 }, spacing: { after: 60 } }));
          i++;
        }
      }
      out.push(new Paragraph({ text: '', spacing: { after: 60 } }));
      continue;
    }
    // 수평선
    if (/^---+$/.test(line.trim())) {
      out.push(new Paragraph({ text: '', border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BBBBCC' } }, spacing: { after: 200 } }));
      i++;
      continue;
    }
    // 문단 (연속 줄 합치기)
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s|\|)/.test(lines[i]) && !/^---+$/.test(lines[i].trim())) buf.push(lines[i++]);
    out.push(para(buf.join(' ')));
  }
  return out;
}

async function image(file, widthPx) {
  const buf = await sharp(path.resolve(file)).resize({ width: Math.round(widthPx * 2) }).jpeg({ quality: 82 }).toBuffer();
  const meta = await sharp(buf).metadata();
  const h = Math.round((widthPx * meta.height) / meta.width);
  return new Paragraph({ children: [new ImageRun({ type: 'jpg', data: buf, transformation: { width: widthPx, height: h } })], alignment: AlignmentType.CENTER, spacing: { after: 80 } });
}

function caption(text) {
  return new Paragraph({ children: [new TextRun({ text, font: FONT, size: 18, color: '555577', italics: true })], alignment: AlignmentType.CENTER, spacing: { after: 200 } });
}

function doc(title, subtitle, children) {
  return new Document({
    creator: '축제의 빈자리 제작팀',
    title,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 34, bold: true, color: '1E2353', font: FONT }, paragraph: { spacing: { before: 360, after: 160 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, color: '2C338A', font: FONT }, paragraph: { spacing: { before: 280, after: 120 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '333355', font: FONT }, paragraph: { spacing: { before: 200, after: 100 } } },
        { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, font: FONT }, paragraph: { spacing: { before: 160, after: 80 } } },
      ],
    },
    numbering: {
      config: [
        { reference: 'bullets', levels: [0, 1, 2].map((l) => ({ level: l, format: LevelFormat.BULLET, text: ['•', '◦', '▪'][l], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + l * 360, hanging: 360 } } } })) },
        { reference: 'nums', levels: [0, 1, 2].map((l) => ({ level: l, format: LevelFormat.DECIMAL, text: '%' + (l + 1) + '.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 + l * 360, hanging: 360 } } } })) },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        children: [
          new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 40, font: FONT, color: '1E2353' })], spacing: { after: 80 } }),
          new Paragraph({ children: [new TextRun({ text: subtitle, size: 22, font: FONT, color: '555577' })], spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '5865F2' } } }),
          ...children,
        ],
      },
    ],
  });
}

async function save(name, document) {
  const buf = await Packer.toBuffer(document);
  await writeFile(path.join(OUT, name), buf);
  console.log(name, (buf.length / 1024).toFixed(0) + 'KB');
}

const WORK = '축제의 빈자리: AI 배정기는 누구를 빼놓았을까';
const SUB = '2026 인공지능 윤리교육 콘텐츠 공모전 · ③ 디지털 콘텐츠 · 중학교 1~3학년 · 45분';
const md = async (f) => readFile(path.resolve(f), 'utf8');

// 1. 완성 콘텐츠 소개
{
  const intro = await md('docs/submission/content-overview.md');
  const children = [];
  // 섹션 사이에 이미지를 끼우기 위해 특수 마커 처리: [[IMG:파일|캡션|폭]]
  for (const chunk of intro.split(/\n(?=\[\[IMG:)/)) {
    const m = /^\[\[IMG:([^|\]]+)\|([^|\]]*)\|?(\d+)?\]\]\n?/.exec(chunk);
    if (m) {
      children.push(await image(m[1], Number(m[3] ?? 600)));
      if (m[2]) children.push(caption(m[2]));
      children.push(...mdToChildren(chunk.slice(m[0].length)));
    } else children.push(...mdToChildren(chunk));
  }
  await save('01_완성콘텐츠_소개.docx', doc(WORK, '완성 콘텐츠 소개 · ' + SUB, children));
}
// 2. 기획의도
{
  const s = await md('docs/SUBMISSION.md');
  await save('02_기획의도.docx', doc(WORK, '기획 의도 · ' + SUB, mdToChildren(s)));
}
// 3. 대상 학년 및 교육 활용방법 (교사용 가이드 전체)
{
  const g = await md('TEACHER_GUIDE.md');
  await save('03_대상학년_교육활용방법_교사용가이드.docx', doc(WORK, '대상 학년 및 교육 활용방법 · 교사용 가이드 · ' + SUB, mdToChildren(g)));
}
// 4. 학생 활동지
{
  const w = await md('docs/STUDENT_WORKSHEET.md');
  await save('04_학생활동지.docx', doc(WORK, '학생 활동지 · ' + SUB, mdToChildren(w)));
}
// 5. 콘텐츠 설계·근거
{
  const c = await md('CONTENT_MAP.md');
  await save('05_콘텐츠설계_원칙연계표.docx', doc(WORK, '콘텐츠 설계와 윤리원칙 연계표 · ' + SUB, mdToChildren(c)));
}
// 6. 생성형 AI 활용 내역 + 검증 기록
{
  const a = await md('AI_USAGE.md');
  const t = await md('TEST_REPORT.md');
  await save('06_AI활용내역_검증기록.docx', doc(WORK, '생성형 AI 활용 내역 · 검증 기록 · ' + SUB, [...mdToChildren(a), new Paragraph({ text: '', pageBreakBefore: true }), ...mdToChildren(t)]));
}
console.log('done →', OUT);
