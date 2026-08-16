// B站自动操作 v2：打开B站 -> 搜索 deepseek v4 pro -> 进入具体直播间
// 运行方式：node bilibili_v2.js
const { chromium } = require('playwright');

(async () => {
  console.log('>>> 正在启动有头模式浏览器...');
  const browser = await chromium.launch({ headless: false });
  browser.on('disconnected', () => {
    console.log('>>> 浏览器窗口已关闭，脚本结束');
    process.exit(0);
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  const kw = 'deepseek v4 pro';

  // 1. 打开B站并搜索（直接访问搜索URL，避免输入框事件问题）
  console.log('>>> [1/4] 打开哔哩哔哩...');
  await page.goto('https://www.bilibili.com', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  console.log('    标题:', await page.title());

  console.log('>>> [2/4] 搜索:', kw);
  await page.goto(`https://search.bilibili.com/all?keyword=${encodeURIComponent(kw)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  console.log('    搜索结果页标题:', await page.title());
  console.log('    URL:', page.url());

  // 3. 优先在搜索结果里找直播链接
  console.log('>>> [3/4] 查找直播间...');
  let liveHref = await page.evaluate(() => {
    const a = document.querySelector('a[href*="//live.bilibili.com/"]');
    return a ? a.href : null;
  }).catch(() => null);

  if (!liveHref) {
    // 去直播搜索页
    console.log('    搜索结果无直播，前往直播搜索页...');
    await page.goto(`https://search.bilibili.com/live?keyword=${encodeURIComponent(kw)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    liveHref = await page.evaluate(() => {
      const a = document.querySelector('a[href*="//live.bilibili.com/"]');
      return a ? a.href : null;
    }).catch(() => null);
  }

  // 4. 仍无结果 → 直播首页找一个具体直播间（房间号链接）进入
  if (!liveHref) {
    console.log('    直播搜索无结果，前往直播首页找直播间...');
    await page.goto('https://live.bilibili.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
    liveHref = await page.evaluate(() => {
      // 匹配 live.bilibili.com/数字 的具体房间链接
      const links = Array.from(document.querySelectorAll('a[href*="//live.bilibili.com/"]'));
      const room = links.find(a => /\/\/live\.bilibili\.com\/\d+/.test(a.href));
      return room ? room.href : (links[0] ? links[0].href : null);
    }).catch(() => null);
  }

  if (!liveHref || /live\.bilibili\.com\/?$/.test(liveHref)) {
    console.log('!!! 仍未找到具体直播间链接，窗口保持打开供手动操作');
  } else {
    console.log('>>> [4/4] 进入直播间:', liveHref);
    await page.goto(liveHref, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);
    console.log('    直播间页面标题:', await page.title());
    console.log('    当前 URL:', page.url());
  }

  console.log('>>> 完成！窗口保持打开，手动关闭即结束。');
  await new Promise(() => {});
})().catch(err => {
  console.error('!!! 脚本出错:', err.message);
  process.exit(1);
});
