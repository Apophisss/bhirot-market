"use client";

import { useEffect } from "react";
import { queueSettings } from "@/lib/settings-client";
import type { SettingsPatch } from "@/lib/settings";

/**
 * שומר בחשבון את הדרך שבה המשתמש סידר את החפיסה.
 *
 * המיון ו"כולל שאלות שכבר עניתי" הם קישורים, כלומר ניווט: הם חיים ב-URL, וזה
 * נכון — אפשר לשלוח אותם, לשמור אותם ולחזור אחורה. אבל הם גם בחירה, ועד כה הם
 * נשכחו בכל פתיחה חדשה של `/rapid`, ובוודאי במכשיר שני. השרת מרנדר את החפיסה
 * לפי מה שנשמר, וזה מה שמעדכן את מה שנשמר כשהמשתמש בוחר אחרת.
 *
 * לא מרנדר כלום, ולא שולח כלום כשאין הבדל בין מה שמוצג למה ששמור: הבחירה נשמרת
 * בהקשה שמשנה אותה, לא בכל טעינת דף.
 */
export function RememberDeckView({ patch }: { patch: SettingsPatch | null }) {
  // מפורק למספר ולבוליאני כדי שאפקט לא ירוץ שוב על אובייקט חדש עם אותו תוכן
  const sort = patch?.rapidSort ?? null;
  const includeAnswered = patch?.rapidIncludeAnswered ?? null;

  useEffect(() => {
    const next: SettingsPatch = {};
    if (sort != null) next.rapidSort = sort;
    if (includeAnswered != null) next.rapidIncludeAnswered = includeAnswered;
    if (Object.keys(next).length) queueSettings(next);
  }, [sort, includeAnswered]);

  return null;
}
