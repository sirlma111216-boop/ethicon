import { describe, expect, it } from 'vitest';
import { APPLICANTS, CAPACITY, PACKAGES, POLICIES } from '../../src/shared/content';
import { allPackageOutcomes, allocateByPackage, compareAllocations, makeLottery, perspectiveBoard, r1Allocation, surveyShift, tallyMulti, tallyVotes } from '../../src/shared/engine';
import { BARRIERS } from '../../src/worker/secretContent';

const lottery = makeLottery('test-room-seed');

describe('가상 데이터 제약', () => {
  it('신청자 12명, 정원 6명, 처음 참여 5명', () => {
    expect(APPLICANTS).toHaveLength(12);
    expect(CAPACITY).toBe(6);
    expect(APPLICANTS.filter((a) => a.prior === 0)).toHaveLength(5);
    expect(new Set(APPLICANTS.map((a) => a.id)).size).toBe(12);
  });
  it('보정표의 신청자는 모두 실제 신청자이고 보정 후 시각이 0 이상', () => {
    for (const [id, d] of Object.entries(BARRIERS)) {
      const a = APPLICANTS.find((x) => x.id === id)!;
      expect(a).toBeDefined();
      expect(a.applyMinute - d).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('추첨 순서', () => {
  it('같은 seed 는 같은 순서, 다른 seed 는 보통 다른 순서', () => {
    expect(makeLottery('abc')).toEqual(makeLottery('abc'));
    expect(makeLottery('abc')).not.toEqual(makeLottery('abd'));
    expect([...makeLottery('abc')].sort()).toEqual(APPLICANTS.map((a) => a.id).sort());
  });
});

describe('라운드 1 정책', () => {
  it('세 정책 모두 정원 6을 지키고 서로 다른 결과를 낸다', () => {
    const results = POLICIES.map((p) => r1Allocation(p.id, lottery));
    for (const r of results) {
      expect(r.selected).toHaveLength(6);
      expect(r.waiting).toHaveLength(6);
      expect(new Set([...r.selected, ...r.waiting]).size).toBe(12);
    }
    const keys = results.map((r) => [...r.selected].sort().join(','));
    expect(new Set(keys).size).toBe(3);
  });
  it('선착순은 처음 참여 2명, 경험 우선은 0명, 첫 참여 우선은 5명', () => {
    expect(r1Allocation('first', lottery).firstTimerCount).toBe(2);
    expect(r1Allocation('experience', lottery).firstTimerCount).toBe(0);
    expect(r1Allocation('newcomer', lottery).firstTimerCount).toBe(5);
  });
  it('선착순에서 신청 기회가 늦게 열린 4명 중 3명 이상이 남는다 (이야기 전제)', () => {
    const r = r1Allocation('first', lottery);
    const barred = Object.keys(BARRIERS);
    expect(barred.filter((id) => r.waiting.includes(id)).length).toBeGreaterThanOrEqual(3);
  });
  it('같은 조건이면 재현된다', () => {
    expect(r1Allocation('first', lottery)).toEqual(r1Allocation('first', lottery));
  });
});

describe('라운드 3 패키지', () => {
  for (const policy of POLICIES) {
    it(`기존 규칙 ${policy.name}: 모든 패키지가 정원 6을 지키고 학급 선택에 따라 결과가 달라진다`, () => {
      const out = allPackageOutcomes(policy.id, lottery, BARRIERS);
      for (const p of PACKAGES) {
        expect(out[p.id].selected).toHaveLength(6);
        expect(new Set([...out[p.id].selected, ...out[p.id].waiting]).size).toBe(12);
      }
      // keep 과 open 은 자리가 같고(설명만 다름), access·mix 는 keep 과 다르다
      expect([...out.keep.selected].sort()).toEqual([...out.open.selected].sort());
      expect(out.open.explanationMinutes).toBeGreaterThan(out.keep.explanationMinutes);
      // 패키지 4개 중 서로 다른 선발 결과가 3가지 이상 (keep=open 은 의도된 동일 결과)
      const distinct = new Set(PACKAGES.map((p) => [...out[p.id].selected].sort().join(',')));
      expect(distinct.size).toBeGreaterThanOrEqual(policy.id === 'newcomer' ? 2 : 3);
      expect([...out.mix.selected].sort()).not.toEqual([...out.keep.selected].sort());
      if (policy.id !== 'newcomer') expect([...out.access.selected].sort()).not.toEqual([...out.keep.selected].sort());
      // 처음 참여 보장
      expect(out.access.firstTimerCount).toBeGreaterThanOrEqual(2);
      expect(out.mix.firstTimerCount).toBe(3);
    });
  }
  it('세 정책 × 네 패키지 조합은 서로 다른 결말을 충분히 만든다', () => {
    const endings = new Set<string>();
    for (const policy of POLICIES) {
      const out = allPackageOutcomes(policy.id, lottery, BARRIERS);
      for (const p of PACKAGES) endings.add([...out[p.id].selected].sort().join(',') + '|' + out[p.id].explanationMinutes);
    }
    expect(endings.size).toBeGreaterThanOrEqual(8);
  });
  it('이전·이후 비교는 유리해진 사람과 불리해진 사람을 함께 낸다', () => {
    const before = r1Allocation('first', lottery);
    const after = allocateByPackage('mix', 'first', lottery, BARRIERS);
    const c = compareAllocations(before, after);
    expect(c.gained.length).toBe(c.lost.length);
    expect(c.gained.length).toBeGreaterThan(0);
    expect(c.unchanged.length + c.gained.length).toBe(6);
  });
  it('다른 추첨 순서에서도 정원과 트랙 구성이 유지된다', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      const lot = makeLottery(seed);
      for (const policy of POLICIES) {
        const out = allPackageOutcomes(policy.id, lot, BARRIERS);
        for (const p of PACKAGES) expect(out[p.id].selected).toHaveLength(6);
        expect(out.mix.firstTimerCount).toBe(3);
        expect(out.access.firstTimerCount).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('집계', () => {
  it('1인 1표, 기권은 분모에 포함되고 동의로 세지 않는다', () => {
    const t = tallyVotes('r', ['first', 'first', 'first', 'experience', 'experience', 'experience', 'abstain'], 30, ['first', 'experience', 'newcomer']);
    expect(t.responded).toBe(7);
    expect(t.eligible).toBe(30);
    expect(t.counts.abstain).toBe(1);
    expect(t.top).toEqual(['first', 'experience']);
  });
  it('3명 미만 항목은 few 로 묶이되 최다 득표는 유지된다', () => {
    const t = tallyVotes('r', ['first', 'first', 'first', 'first', 'newcomer', 'experience'], 10, ['first', 'experience', 'newcomer']);
    expect(t.counts.first).toBe(4);
    expect(t.counts.few).toBe(2);
    expect(t.counts.experience).toBeUndefined();
    expect(t.smallGroupsMerged).toBe(true);
  });
  it('복수 선택 상위 2개, 경계 동률은 tie 로 드러난다', () => {
    const t = tallyMulti('r', [['a', 'b'], ['a', 'c'], ['a', 'b'], ['c', 'd'], ['b', 'c']], 10, ['a', 'b', 'c', 'd'], 2);
    expect(t.counts.a).toBe(3);
    expect(t.top.length).toBeGreaterThan(2); // b,c 동률 3표
  });
  it('관점 보드는 3명 미만 관점의 태그를 숨긴다', () => {
    const rows = perspectiveBoard(
      [
        { perspective: 'applicant', tag: 'why' },
        { perspective: 'applicant', tag: 'why' },
        { perspective: 'applicant', tag: 'appeal' },
        { perspective: 'guide', tag: 'criteria' },
      ],
      ['applicant', 'newcomer', 'organizer', 'guide'],
    );
    expect(rows[0]!.merged).toBe(false);
    expect(rows[0]!.tags.why).toBe(2);
    expect(rows[3]!.merged).toBe(true);
    expect(rows[3]!.tags).toEqual({});
  });
  it('사전·사후 분포는 3명 미만이면 null', () => {
    expect(surveyShift(['always'], ['depends'])).toBeNull();
    expect(surveyShift(['always', 'always', 'depends'], ['depends', 'depends', 'depends'])).not.toBeNull();
  });
});
