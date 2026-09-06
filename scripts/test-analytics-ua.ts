/**
 * Which user agents the collector treats as bots (src/lib/analytics.ts).
 *
 * The filter exists to keep crawlers and link previews out of the log; it must
 * never drop a person. Four tokens did: `telegram`, `duckduck`, `yandex` and a bare
 * `bot` matched the Telegram and DuckDuckGo in-app browsers, the Yandex app and
 * CUBOT phones — the kind of browsers a mobile ad campaign serves inside.
 *
 *   npm run test:ua
 */
import { requestContext } from "../src/lib/analytics";

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) return;
  failures++;
  console.error(`✗ ${name}`);
}

const isBot = (ua: string) => requestContext(new Request("http://x/", { headers: { "user-agent": ua } })).isBot;

const PEOPLE: [string, string][] = [
  ["Telegram Android in-app", "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Telegram-Android/10.2.2 (Samsung SM-A536B; Android 13; SDK 33; AVERAGE)"],
  ["DuckDuckGo Android", "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 DuckDuckGo/5"],
  ["Yandex app", "Mozilla/5.0 (Linux; arm_64; Android 11; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.199 YaApp_Android/24.10 YaSearchBrowser/24.10 BroPP/1.0 SA/3 Mobile Safari/537.36 YandexSearch/24.10"],
  ["CUBOT phone", "Mozilla/5.0 (Linux; Android 10; CUBOT KINGKONG 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Mobile Safari/537.36"],
  ["YouTube iOS (SFSafariViewController)", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"],
  ["YouTube Android (WebView)", "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36"],
  ["Instagram iOS", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0.0"],
  ["Facebook Android", "Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/430.0.0.0;]"],
  ["Google app (Discover)", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GSA/300.0.0 Safari/604.1"],
  ["Chrome Android", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"],
  ["Safari iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"],
  ["Samsung Internet", "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36"],
];

const MACHINES: [string, string][] = [
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
  ["AdsBot", "AdsBot-Google (+http://www.google.com/adsbot.html)"],
  ["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
  ["YandexBot", "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"],
  ["DuckDuckBot", "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)"],
  ["Telegram link preview", "TelegramBot (like TwitterBot)"],
  ["WhatsApp link preview", "WhatsApp/2.23.20.0 A"],
  ["Discord link preview", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"],
  ["facebookexternalhit", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
  ["curl", "curl/8.4.0"],
  ["Lighthouse", "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse"],
  ["headless", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36"],
  ["empty", ""],
];

for (const [name, ua] of PEOPLE) check(`a person is not a bot: ${name}`, !isBot(ua));
for (const [name, ua] of MACHINES) check(`a machine is a bot: ${name}`, isBot(ua));

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log(`✓ analytics user agents: ${PEOPLE.length} browsers kept, ${MACHINES.length} machines dropped`);
