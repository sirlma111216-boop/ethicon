// 브라우저 저장: 재접속·새로고침 복구용 자격만 둔다. 멀티플레이 상태는 서버가 가진다.
export interface TeacherCreds {
  code: string;
  teacherToken: string;
  publicToken: string;
  expiresAt: number;
}
export interface StudentCreds {
  code: string;
  participantId: string;
  studentToken: string;
  pseudonym: string;
  avatar: number;
  savedAt: number;
}

const T_KEY = 'festival.teacher';
const S_KEY = 'festival.student';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 사생활 보호 모드 등 */
  }
}
function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const teacherStore = {
  get(): TeacherCreds | null {
    const c = read<TeacherCreds>(T_KEY);
    if (c && c.expiresAt < Date.now()) {
      remove(T_KEY);
      return null;
    }
    return c;
  },
  set: (c: TeacherCreds) => write(T_KEY, c),
  clear: () => remove(T_KEY),
};

export const studentStore = {
  get(code?: string): StudentCreds | null {
    const c = read<StudentCreds>(S_KEY);
    if (!c) return null;
    if (Date.now() - c.savedAt > 24 * 3600_000) {
      remove(S_KEY);
      return null;
    }
    if (code && c.code !== code) return null;
    return c;
  },
  set: (c: StudentCreds) => write(S_KEY, c),
  clear: () => remove(S_KEY),
};

export const prefs = {
  get<T>(key: string, fallback: T): T {
    const v = read<T>(`festival.pref.${key}`);
    return v === null ? fallback : v;
  },
  set: (key: string, value: unknown) => write(`festival.pref.${key}`, value),
};
