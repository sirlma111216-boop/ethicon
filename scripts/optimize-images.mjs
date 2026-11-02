// 제공된 PNG 원본(assets/images)을 앱용 WebP 로 최적화한다. 원본은 수정하지 않는다.
// 사용: node scripts/optimize-images.mjs
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve('assets/images');
const OUT = path.resolve('public/images/festival');
const MANIFEST = path.resolve('public/images/festival/manifest.json');

// 용도별 출력 폭. 원본보다 크게 늘리지 않는다.
const PLAN = {
  'intro-desktop': [1672, 1280],
  'ending-desktop': [1672, 1280],
  'scene-allocation': [1672, 1280],
  'scene-investigation': [1672, 1280],
  'scene-redesign': [1672, 1280],
  'intro-mobile': [941, 720],
  'ending-mobile': [941, 720],
  'perspective-applicant': [640, 320],
  'perspective-newcomer': [640, 320],
  'perspective-organizer': [640, 320],
  'perspective-guide': [640, 320],
  'clue-access': [960, 640],
  'clue-experience': [960, 640],
  'clue-rules': [960, 640],
  'clue-explanation': [960, 640],
  'badge-perspective': [320, 160],
  'badge-evidence': [320, 160],
  'badge-revision': [320, 160],
};

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => f.endsWith('.png'));
const manifest = [];
for (const file of files) {
  const id = file.replace(/\.png$/, '');
  const widths = PLAN[id];
  if (!widths) {
    console.warn('계획에 없는 이미지, 건너뜀:', file);
    continue;
  }
  const input = await readFile(path.join(SRC, file));
  const meta = await sharp(input).metadata();
  const outputs = [];
  for (const w of widths) {
    const name = `${id}-${w}.webp`;
    const buf = await sharp(input)
      .resize({ width: Math.min(w, meta.width ?? w), withoutEnlargement: true })
      .webp({ quality: id.startsWith('badge') ? 90 : 82, alphaQuality: 100, effort: 5 })
      .toBuffer();
    await writeFile(path.join(OUT, name), buf);
    const m = await sharp(buf).metadata();
    outputs.push({ file: `images/festival/${name}`, width: m.width, height: m.height, bytes: buf.length });
  }
  const srcStat = await stat(path.join(SRC, file));
  manifest.push({
    id,
    source: `assets/images/${file}`,
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    sourceBytes: srcStat.size,
    hasAlpha: meta.hasAlpha,
    outputs,
  });
  console.log(id, outputs.map((o) => `${o.width}w ${(o.bytes / 1024).toFixed(0)}KB`).join(', '));
}
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
console.log('manifest →', MANIFEST);
