Deno.serve(() => {
  return new Response("<h1>欢迎来到我的 Deno 页面</h1>", {
    headers: { "content-type": "text/html" }
  });
});