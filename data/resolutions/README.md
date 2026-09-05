# ריצות הכרעה

כל קובץ `<runId>.json` כאן הוא **ריצת הכרעה אחת**: אילו שאלות עבר מועד הסגירה שלהן, מה הסוכן הציע
לכל אחת, על סמך איזו ראיה, מי אישר, מתי, ומה השרת ענה כשההכרעות פורסמו. זה הארכיון של
״מה שאלנו, מה עניתם, ומי אמר כן״ — ולכן הקבצים נשמרים ב-git ואינם נמחקים אחרי הפרסום.

הצינור עצמו: `npm run resolve -- <propose|report|approve|apply|publish|status>`
(הקוד: `scripts/resolve.ts`, הכללים: `src/lib/resolution.ts`, ההסבר: `.claude/skills/market-resolutions`).

הדוחות ל-HTML (`<runId>.report.html`) נוצרים מחדש מקובץ הריצה בכל `report` ולכן אינם נשמרים ב-git.
