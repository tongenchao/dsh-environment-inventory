// 浏览器自动化演示脚本：打开必应，搜索关键词，提取搜索结果
// 运行方式：node demo_search.js
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('>>> 打开必应首页...');
  await page.goto('https://www.bing.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log('>>> 页面标题:', await page.title());

  // 输入搜索关键词
  const keyword = process.argv[2] || 'AI 语音输入工具';
  console.log(`>>> 搜索关键词: ${keyword}`);
  await page.fill('textarea[name="q"], input[name="q"]', keyword);
  await page.press('textarea[name="q"], input[name="q"]', 'Enter');

  // 等待搜索结果出现
  await page.waitForSelector('#b_results', { timeout: 30000 });
  console.log('>>> 搜索结果已加载，提取中...\n');

  // 提取搜索结果的标题和链接
  const results = await page.$$eval('#b_results > li', items =>
    items.slice(0, 10).map(li => {
      const a = li.querySelector('h2 a');
      const snippet = li.querySelector('.b_caption p, .b_lineclamp2, p');
      return a ? {
        title: a.innerText.trim(),
        url: a.href,
        snippet: snippet ? snippet.innerText.trim() : ''
      } : null;
    }).filter(Boolean)
  );

  if (results.length === 0) {
    console.log('未提取到结果，输出页面部分文本:');
    const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log(text);
  } else {
    results.forEach((r, i) => {
      console.log(`[${i + 1}] ${r.title}`);
      console.log(`    URL: ${r.url}`);
      if (r.snippet) console.log(`    摘要: ${r.snippet.slice(0, 120)}`);
      console.log('');
    });
  }

  await browser.close();
  console.log('>>> 完成，浏览器已关闭');
})().catch(err => {
  console.error('!!! 脚本出错:', err.message);
  process.exit(1);
});
