/** ドメインのルールに反する操作をしたときのエラー。message はそのまま画面に出せる日本語にする */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
