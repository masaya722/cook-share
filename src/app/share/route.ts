// Android の共有メニューから呼ばれる。YouTube アプリなどは URL を text に入れてくるので、そこから拾う。
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const candidates = [params.get("url"), params.get("text"), params.get("title")];
  const url = candidates
    .flatMap((s) => (s ? (s.match(/https?:\/\/\S+/g) ?? []) : []))
    .find((s) => URL.canParse(s));

  const target = new URL("/recipes/new", request.url);
  if (url) target.searchParams.set("url", url);
  return Response.redirect(target, 303);
}
