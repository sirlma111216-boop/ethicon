// wrangler types 가 생성한 Env 에 비밀값(Secrets) 타입을 덧붙인다.
interface Env {
  /** 선택: 설정하면 방 생성 시 교사용 비밀번호를 요구한다. Cloudflare Secret 으로 등록. */
  TEACHER_CREATE_SECRET?: string;
}
