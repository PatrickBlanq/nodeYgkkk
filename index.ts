Deno.serve(() => {
  const html = `
  <!DOCTYPE html>
  <html lang="zh">
  <head>
    <meta charset="UTF-8" />
    <title>欢迎页</title>
    <style>
      body {
        font-family: sans-serif;
        background: #f5f5f5;
        padding: 40px;
        text-align: center;
      }
      h1 {
        color: #333;
        font-size: 32px;
      }
      p {
        color: #666;
        font-size: 18px;
      }
    </style>
  </head>
  <body>
    <h1>欢迎来到我的 Deno 页面 🎉</h1>
    <p>部署成功！你现在看到的是一个纯 HTML 欢迎页。</p>
  </body>
  </html>
  `;

  return new Response(html, {
    headers: { "content-type": "text/html" }
  });
});